import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FeatureFlagKey, RecordShareAccessLevel } from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import {
  type PermissionsRowAccessEvaluationRequest,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { buildPermissionsCondition } from 'src/engine/permissions/combine/utils/build-permissions-condition.util';
import { findPermissionsAdmittedRecordIds } from 'src/engine/permissions/combine/utils/find-permissions-admitted-record-ids.util';
import { PermissionsException } from 'src/engine/permissions/permissions.exception';
import { assertDirectMessageRecordMutationOrThrow } from 'src/engine/permissions/private-record/utils/assert-direct-message-record-mutation-or-throw.util';
import { buildDirectMessagePairCondition } from 'src/engine/permissions/private-record/utils/build-direct-message-pair-condition.util';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const MEMBER_ID = 'member-one';
const PEER_ID = 'member-two';
const ROLE_ID = 'role-with-full-access';
const thread: RowAccessRecord = {
  id: 'thread-id',
  conversationType: 'DIRECT_MESSAGE',
  directMessageFirstWorkspaceMemberId: MEMBER_ID,
  directMessageSecondWorkspaceMemberId: PEER_ID,
};

const buildRequest = ({
  workspaceMemberId = MEMBER_ID,
  objectName = 'agentChatThread',
  records = [thread],
}: {
  workspaceMemberId?: string;
  objectName?:
    | 'agentChatThread'
    | 'agentMessage'
    | 'agentMessagePart'
    | 'agentChatThreadTarget';
  records?: RowAccessRecord[];
} = {}): PermissionsRowAccessEvaluationRequest => {
  const flatObjectMetadata = getFlatObjectMetadataMock({
    nameSingular: objectName,
    universalIdentifier: STANDARD_OBJECTS[objectName].universalIdentifier,
  });

  return {
    principal: {
      workspaceId: WORKSPACE_ID,
      mainPrincipal: { roleId: ROLE_ID, workspaceMemberId },
      applicationPrincipal: { isCustomApp: true },
    },
    metadataMaps: {
      flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
      flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
      flatApplicationMaps: { byId: {} },
      flatRowLevelPermissionPredicateMaps: createEmptyFlatEntityMaps(),
      flatRowLevelPermissionPredicateGroupMaps: createEmptyFlatEntityMaps(),
      rolesPermissions: {
        [ROLE_ID]: {
          [flatObjectMetadata.id]: {
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: true,
            canDestroyObjectRecords: true,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        },
      },
      featureFlagsMap: {
        [FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED]: true,
        [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: true,
        [FeatureFlagKey.IS_PRIVATE_RECORD_ENABLED]: true,
      },
    },
    flatObjectMetadata,
    operationType: 'select',
    hypotheticalRecordShareAccessLevel: RecordShareAccessLevel.FULL,
    records,
    context: {
      shouldIgnoreSoftDeleteDefaultFilter: true,
      fetchRecordShares: async () => [],
      findPrivateRecordStates: async () => new Map(),
      findRelatedRecords: async ({ objectNameSingular, recordIds }) => {
        const availableRecords =
          objectNameSingular === 'agentChatThread'
            ? [thread]
            : [{ id: 'message-id', threadId: thread.id }];

        return availableRecords.filter(({ id }) => recordIds.includes(id));
      },
    },
  };
};

describe('fixed direct message pair permissions', () => {
  it.each([MEMBER_ID, PEER_ID])(
    'keeps existing access for pair member %s',
    async (workspaceMemberId) => {
      expect(
        await findPermissionsAdmittedRecordIds(
          buildRequest({ workspaceMemberId }),
        ),
      ).toEqual(new Set([thread.id]));
    },
  );

  it('denies an outsider even with a full hypothetical grant and unrestricted role', async () => {
    expect(
      await findPermissionsAdmittedRecordIds(
        buildRequest({ workspaceMemberId: 'administrator' }),
      ),
    ).toEqual(new Set());
  });

  it('does not turn pair membership into a record grant', async () => {
    const request = buildRequest();

    request.hypotheticalRecordShareAccessLevel = undefined;
    request.metadataMaps.rolesPermissions = {};

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());
  });

  it('denies application-only principals despite their full grant', async () => {
    const request = buildRequest();

    request.principal.mainPrincipal = {
      roleId: ROLE_ID,
      applicationId: 'application-id',
    };

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());
  });

  it('retains the member boundary for a delegated application', async () => {
    const request = buildRequest();

    request.principal.applicationPrincipal = {
      roleId: ROLE_ID,
      applicationId: 'application-id',
    };

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set([thread.id]),
    );
    request.principal.mainPrincipal = {
      roleId: ROLE_ID,
      workspaceMemberId: 'outsider',
    };
    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());
  });

  it('checks message-part event snapshots through their stored message and thread', async () => {
    const records = [{ id: 'part-id', messageId: 'message-id' }];

    expect(
      await findPermissionsAdmittedRecordIds(
        buildRequest({ objectName: 'agentMessagePart', records }),
      ),
    ).toEqual(new Set(['part-id']));
    expect(
      await findPermissionsAdmittedRecordIds(
        buildRequest({
          objectName: 'agentMessagePart',
          records,
          workspaceMemberId: 'outsider',
        }),
      ),
    ).toEqual(new Set());
  });

  it('resolves a partial thread event before applying the pair boundary', async () => {
    const request = buildRequest({
      records: [{ id: thread.id, title: 'Private' }],
      workspaceMemberId: 'outsider',
    });

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());
  });

  it('hydrates omitted pair columns and denies missing thread snapshots', async () => {
    const request = buildRequest({
      records: [
        {
          id: thread.id,
          conversationType: 'DIRECT_MESSAGE',
          directMessageFirstWorkspaceMemberId: MEMBER_ID,
        },
      ],
    });

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set([thread.id]),
    );
    request.context.findRelatedRecords = async () => [];
    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());
  });

  it('does not reference pair columns before workspace readiness', () => {
    const request = buildRequest();

    request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ] = false;

    expect(
      buildDirectMessagePairCondition({
        ...request,
        tableAlias: 'thread',
        recordShareTableExpression: 'recordShare',
      }),
    ).toBeUndefined();
  });

  it('keeps the SQL pair restriction when a hypothetical grant admits the record', () => {
    const condition = buildPermissionsCondition({
      ...buildRequest(),
      tableAlias: 'thread',
      recordShareTableExpression: 'recordShare',
    });

    expect(condition).toEqual({
      sql: expect.stringContaining(
        '"thread"."directMessageFirstWorkspaceMemberId"',
      ),
      parameters: expect.objectContaining({}),
    });
    expect(
      typeof condition === 'object' ? Object.values(condition.parameters) : [],
    ).toContain(MEMBER_ID);
  });

  it('rejects generic history edits and attempts to reclassify a DM', async () => {
    const request = buildRequest();

    await expect(
      assertDirectMessageRecordMutationOrThrow({
        ...request,
        operationType: 'update',
        recordsBefore: [thread],
        recordsAfter: [{ ...thread, conversationType: 'STANDARD' }],
      }),
    ).rejects.toBeInstanceOf(PermissionsException);
    await expect(
      assertDirectMessageRecordMutationOrThrow({
        ...request,
        operationType: 'update',
        recordsBefore: [thread],
        recordsAfter: [{ ...thread, title: 'Renamed' }],
      }),
    ).rejects.toBeInstanceOf(PermissionsException);
  });

  it('keeps record detachment available to the pair without admitting record readers', async () => {
    const request = buildRequest({
      objectName: 'agentChatThreadTarget',
      records: [{ id: 'target-id', threadId: thread.id }],
    });

    request.operationType = 'delete';
    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set(['target-id']),
    );
    request.principal.mainPrincipal = {
      roleId: ROLE_ID,
      workspaceMemberId: 'record-reader',
    };
    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());
  });
});
