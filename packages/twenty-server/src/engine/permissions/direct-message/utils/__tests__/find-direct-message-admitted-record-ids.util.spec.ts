import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  FeatureFlagKey,
  FieldMetadataType,
  RecordShareAccessLevel,
} from 'twenty-shared/types';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import {
  type PermissionsMetadataMaps,
  type PermissionsRowAccessEvaluationRequest,
  type RowAccessEvaluationContext,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { findPermissionsAdmittedRecordIds } from 'src/engine/permissions/combine/utils/find-permissions-admitted-record-ids.util';
import { RecordAccessPolicyService } from 'src/engine/permissions/combine/services/record-access-policy.service';
import { type DirectMessagePermissionObject } from 'src/engine/permissions/direct-message/types/direct-message-permission-object.type';
import { type DirectMessageThreadPair } from 'src/engine/permissions/direct-message/types/direct-message-thread-pair.type';
import { findDirectMessageAdmittedRecordIds } from 'src/engine/permissions/direct-message/utils/find-direct-message-admitted-record-ids.util';
import { validateDirectMessageRecordsForWrite } from 'src/engine/permissions/direct-message/utils/validate-direct-message-records-for-write.util';
import { PermissionsExceptionCode } from 'src/engine/permissions/permissions.exception';
import { type RecordShareGrant } from 'src/engine/permissions/record-share/types/record-share-grant.type';

const MEMBER_ID = 'member-one';
const PEER_ID = 'member-two';
const OUTSIDER_ID = 'outsider';
const DIRECT_MESSAGE_ID = 'direct-message';
const REGULAR_THREAD_ID = 'regular-thread';
const ROLE_ID = 'member-role';
const directMessagePair: DirectMessageThreadPair = {
  conversationType: 'DIRECT_MESSAGE',
  directMessageFirstWorkspaceMemberId: MEMBER_ID,
  directMessageSecondWorkspaceMemberId: PEER_ID,
};
const regularThreadPair: DirectMessageThreadPair = {
  conversationType: 'STANDARD',
  directMessageFirstWorkspaceMemberId: null,
  directMessageSecondWorkspaceMemberId: null,
};
const fullAccess = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
};

const buildRequest = ({
  objectName = 'agentChatThread',
  workspaceMemberId = MEMBER_ID,
}: {
  objectName?: DirectMessagePermissionObject;
  workspaceMemberId?: string;
} = {}): PermissionsRowAccessEvaluationRequest => {
  const flatObjectMetadata = getFlatObjectMetadataMock({
    id: 'object-id',
    nameSingular: objectName,
    universalIdentifier: STANDARD_OBJECTS[objectName].universalIdentifier,
    fieldIds: [],
  });
  const conversationTypeField = getFlatFieldMetadataMock({
    objectMetadataId: flatObjectMetadata.id,
    type: FieldMetadataType.SELECT,
    name: 'conversationType',
    universalIdentifier:
      STANDARD_OBJECTS.agentChatThread.fields.conversationType
        .universalIdentifier,
  });
  const metadataMaps: PermissionsMetadataMaps = {
    flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
    flatFieldMetadataMaps: addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: conversationTypeField,
      flatEntityMaps: createEmptyFlatEntityMaps(),
    }),
    rolesPermissions: {
      [ROLE_ID]: { [flatObjectMetadata.id]: fullAccess },
    },
    flatApplicationMaps: { byId: {} },
    flatRowLevelPermissionPredicateMaps: createEmptyFlatEntityMaps(),
    flatRowLevelPermissionPredicateGroupMaps: createEmptyFlatEntityMaps(),
    featureFlagsMap: {
      [FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED]: true,
      [FeatureFlagKey.IS_PRIVATE_RECORD_ENABLED]: true,
      [FeatureFlagKey.IS_RECORD_LEVEL_SHARING_ENABLED]: true,
    },
  };
  const context: RowAccessEvaluationContext = {
    shouldIgnoreSoftDeleteDefaultFilter: true,
    fetchRecordShares: async () => [],
    findPrivateRecordStates: async () => new Map(),
    findDirectMessageThreadPairs: async () =>
      new Map([
        [DIRECT_MESSAGE_ID, directMessagePair],
        [REGULAR_THREAD_ID, regularThreadPair],
      ]),
    findAgentChatMessageThreadIds: async () =>
      new Map([['message-id', DIRECT_MESSAGE_ID]]),
    findAdmittedDirectMessageThreadIds: async () =>
      new Set([DIRECT_MESSAGE_ID]),
  };

  return {
    principal: {
      workspaceId: 'workspace-id',
      mainPrincipal: {
        type: 'workspaceMember',
        roleId: ROLE_ID,
        workspaceMemberId,
      },
      applicationPrincipal: { type: 'customApplication' },
    },
    flatObjectMetadata,
    metadataMaps,
    records: [
      { id: DIRECT_MESSAGE_ID, ...directMessagePair },
      { id: REGULAR_THREAD_ID, ...regularThreadPair },
    ],
    operationType: 'select',
    context,
  };
};

describe('direct message record admission', () => {
  it('denies an outsider with a named grant while preserving ordinary chats', async () => {
    const request = buildRequest({ workspaceMemberId: OUTSIDER_ID });
    const recordShares: RecordShareGrant[] = [
      {
        recordId: DIRECT_MESSAGE_ID,
        principalId: OUTSIDER_ID,
        accessLevel: RecordShareAccessLevel.FULL,
      },
    ];

    request.context.fetchRecordShares = async () => recordShares;

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set([REGULAR_THREAD_ID]),
    );
  });

  it('requires the pair member to retain ordinary private-record access', async () => {
    const request = buildRequest();

    request.context.findPrivateRecordStates = async () =>
      new Map([
        [
          DIRECT_MESSAGE_ID,
          { isPrivate: true, createdByWorkspaceMemberId: null },
        ],
      ]);

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set([REGULAR_THREAD_ID]),
    );

    request.context.fetchRecordShares = async () => [
      {
        recordId: DIRECT_MESSAGE_ID,
        principalId: MEMBER_ID,
        accessLevel: RecordShareAccessLevel.READ_WRITE,
      },
    ];

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set([DIRECT_MESSAGE_ID, REGULAR_THREAD_ID]),
    );
  });

  it('blocks classified DMs while identity storage is disabled', async () => {
    const request = buildRequest();

    request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ] = false;

    expect(await findDirectMessageAdmittedRecordIds(request)).toEqual(
      new Set([REGULAR_THREAD_ID]),
    );
  });

  it('keeps canonical DMs behind their legacy shares before private records are enabled', async () => {
    const request = buildRequest();

    request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_PRIVATE_RECORD_ENABLED
    ] = false;

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(new Set());

    request.context.fetchRecordShares = async () => [
      {
        recordId: DIRECT_MESSAGE_ID,
        principalId: MEMBER_ID,
        accessLevel: RecordShareAccessLevel.READ_WRITE,
      },
    ];

    expect(await findPermissionsAdmittedRecordIds(request)).toEqual(
      new Set([DIRECT_MESSAGE_ID]),
    );
  });

  it.each([
    'agentChatThreadParticipant',
    'agentChatThreadTarget',
    'agentMessage',
    'agentTurn',
  ] as const)('requires parent access for %s snapshots', async (objectName) => {
    const request = buildRequest({ objectName });

    request.records = [
      { id: 'dm-child', threadId: DIRECT_MESSAGE_ID },
      { id: 'ordinary-child', threadId: REGULAR_THREAD_ID },
    ];
    request.context.findAdmittedDirectMessageThreadIds = async () => new Set();

    expect(await findDirectMessageAdmittedRecordIds(request)).toEqual(
      new Set(['ordinary-child']),
    );
  });

  it.each(['agentMessagePart', 'agentMessageReaction'] as const)(
    'resolves %s snapshots through their message and denies outsiders',
    async (objectName) => {
      const request = buildRequest({
        objectName,
        workspaceMemberId: OUTSIDER_ID,
      });

      request.records = [{ id: 'message-child', messageId: 'message-id' }];

      expect(await findDirectMessageAdmittedRecordIds(request)).toEqual(
        new Set(),
      );
    },
  );

  it('requires write access when a relation is moved into a DM', async () => {
    const request = buildRequest({ objectName: 'agentChatThreadTarget' });
    const findAdmittedDirectMessageThreadIds = jest.fn(
      async () => new Set<string>(),
    );

    request.operationType = 'insert';
    request.records = [{ id: 'target-id', threadId: DIRECT_MESSAGE_ID }];
    request.context.findAdmittedDirectMessageThreadIds =
      findAdmittedDirectMessageThreadIds;

    expect(await findDirectMessageAdmittedRecordIds(request)).toEqual(
      new Set(),
    );
    expect(findAdmittedDirectMessageThreadIds).toHaveBeenCalledWith({
      threadIds: [DIRECT_MESSAGE_ID],
      principal: request.principal,
      operationType: 'update',
    });
  });

  it('rejects generic canonical creation even by a member of the pair', async () => {
    const request = buildRequest();

    request.operationType = 'insert';
    request.records = [{ id: DIRECT_MESSAGE_ID, ...directMessagePair }];

    await expect(
      validateDirectMessageRecordsForWrite(request),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('rejects canonical pair fields disguised as an ordinary chat insert', async () => {
    const request = buildRequest();

    request.operationType = 'insert';
    request.records = [
      {
        id: DIRECT_MESSAGE_ID,
        ...directMessagePair,
        conversationType: 'STANDARD',
      },
    ];

    await expect(
      validateDirectMessageRecordsForWrite(request),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('preserves ordinary chat creation and rejects target insertion without DM write access', async () => {
    const ordinaryRequest = buildRequest();

    ordinaryRequest.operationType = 'insert';
    ordinaryRequest.records = [{ id: REGULAR_THREAD_ID, ...regularThreadPair }];

    await expect(
      validateDirectMessageRecordsForWrite(ordinaryRequest),
    ).resolves.toBeUndefined();

    const targetRequest = buildRequest({ objectName: 'agentChatThreadTarget' });

    targetRequest.operationType = 'insert';
    targetRequest.records = [{ id: 'target-id', threadId: DIRECT_MESSAGE_ID }];
    targetRequest.context.findAdmittedDirectMessageThreadIds = async () =>
      new Set();

    await expect(
      validateDirectMessageRecordsForWrite(targetRequest),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });
  });

  it('keeps a private before snapshot out of an ordinary thread reparent event', async () => {
    const request = buildRequest({ objectName: 'agentChatThreadTarget' });
    const threadObjectMetadata = getFlatObjectMetadataMock({
      id: 'thread-object-id',
      nameSingular: 'agentChatThread',
      universalIdentifier: STANDARD_OBJECTS.agentChatThread.universalIdentifier,
      fieldIds: [],
    });

    request.metadataMaps.flatObjectMetadataMaps =
      addFlatEntityToFlatEntityMapsOrThrow({
        flatEntity: threadObjectMetadata,
        flatEntityMaps: createEmptyFlatEntityMaps(),
      });

    const service = new RecordAccessPolicyService(
      {
        getOrRecompute: async () => ({
          userWorkspaceRoleMap: {
            'member-workspace': ROLE_ID,
            'outsider-workspace': ROLE_ID,
          },
          apiKeyRoleMap: {},
          flatRoleTargetByAgentIdMaps: {},
          flatApplicationMaps: { byId: {} },
          flatWorkspaceMemberMaps: {
            byId: {
              [MEMBER_ID]: { userId: 'member-user' },
              [OUTSIDER_ID]: { userId: 'outsider-user' },
            },
            userWorkspaceIdByUserId: {
              'member-user': 'member-workspace',
              'outsider-user': 'outsider-workspace',
            },
          },
        }),
      } as never,
      { findByRecordIds: async () => [] } as never,
      { findStates: async () => new Map() } as never,
      {
        executeInWorkspaceContext: async (work: () => Promise<unknown>) =>
          work(),
        getRepository: () => ({
          find: async () => [
            { id: DIRECT_MESSAGE_ID, ...directMessagePair },
            { id: REGULAR_THREAD_ID, ...regularThreadPair },
          ],
          findPrincipalAdmittedRecordIds: async () =>
            new Set([DIRECT_MESSAGE_ID]),
        }),
      } as never,
    );

    jest
      .spyOn(service, 'loadPermissionsMetadataMaps')
      .mockResolvedValue(request.metadataMaps);

    const eventGate = service.buildEventRecordAccessGate({
      workspaceId: request.principal.workspaceId,
      objectMetadata: request.flatObjectMetadata,
      name: 'agentChatThreadTarget.updated',
      events: [
        {
          recordId: 'target-id',
          properties: {
            before: { id: 'target-id', threadId: DIRECT_MESSAGE_ID },
            after: { id: 'target-id', threadId: REGULAR_THREAD_ID },
            updatedFields: ['threadId'],
            diff: {},
          },
        },
      ],
    });

    expect(
      await eventGate.resolveAdmittedRecordIds({
        ...request.principal,
        mainPrincipal: {
          type: 'workspaceMember',
          workspaceMemberId: OUTSIDER_ID,
        },
      }),
    ).toEqual(new Set());
    expect(await eventGate.resolveAdmittedRecordIds(request.principal)).toEqual(
      new Set(['target-id']),
    );
  });
});
