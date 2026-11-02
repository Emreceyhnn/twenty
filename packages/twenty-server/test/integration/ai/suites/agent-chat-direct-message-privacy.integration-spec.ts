import { randomUUID } from 'node:crypto';

import { parse } from 'graphql';
import { createChatParticipationTestContext } from 'test/integration/ai/utils/create-chat-participation-test-context.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlApiRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';
import { makeMetadataApiRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FeatureFlagKey, RecordShareAccessLevel } from 'twenty-shared/types';

import { type AgentChatDirectMessageIdentityService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-direct-message-identity.service';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { COMPANY_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/company-data-seeds.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

describe('Direct message fixed pair privacy', () => {
  let context: Awaited<ReturnType<typeof createChatParticipationTestContext>>;
  let identityService: AgentChatDirectMessageIdentityService;
  let wasIdentityEnabled: boolean;

  beforeEach(async () => {
    context = await createChatParticipationTestContext();
    identityService =
      getAppProviderByClassName<AgentChatDirectMessageIdentityService>(
        'AgentChatDirectMessageIdentityService',
      );
    wasIdentityEnabled = await context.featureFlagService.isFeatureEnabled(
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED,
      context.workspaceId,
    );
    await context.featureFlagService.upsertWorkspaceFeatureFlag({
      workspaceId: context.workspaceId,
      featureFlag: FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED,
      value: true,
    });
  });

  afterEach(async () => {
    await context.featureFlagService.upsertWorkspaceFeatureFlag({
      workspaceId: context.workspaceId,
      featureFlag: FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED,
      value: wasIdentityEnabled,
    });
    await context.cleanup();
  });

  const createIdentity = async (
    firstWorkspaceMemberId = WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
  ) => {
    const threadId = context.registerThread(
      await identityService.getOrCreate({
        workspaceId: context.workspaceId,
        firstWorkspaceMemberId,
        secondWorkspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
      }),
    );

    for (const recipientWorkspaceMemberId of [
      firstWorkspaceMemberId,
      WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    ]) {
      await context.share({
        threadId,
        recipientWorkspaceMemberId,
        accessLevel: RecordShareAccessLevel.FULL,
      });
    }

    return threadId;
  };

  const listThread = ({
    threadId,
    token,
  }: {
    threadId: string;
    token: string;
  }) =>
    makeGraphqlApiRequest(
      findManyOperationFactory({
        objectMetadataSingularName: 'agentChatThread',
        objectMetadataPluralName: 'agentChatThreads',
        gqlFields: 'id',
        filter: { id: { eq: threadId } },
      }),
      token,
    );

  it('denies an outside administrator with a full grant while retaining access for the pair', async () => {
    const threadId = await createIdentity(WORKSPACE_MEMBER_DATA_SEED_IDS.TIM);

    await context.share({
      threadId,
      recipientWorkspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
      accessLevel: RecordShareAccessLevel.FULL,
    });

    const outsideList = await listThread({
      threadId,
      token: APPLE_JANE_ADMIN_ACCESS_TOKEN,
    });
    const participantList = await listThread({
      threadId,
      token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
    });

    expect(outsideList.body.errors).toBeUndefined();
    expect(outsideList.body.data.agentChatThreads.edges).toEqual([]);
    expect(participantList.body.errors).toBeUndefined();
    expect(participantList.body.data.agentChatThreads.edges).toEqual([
      expect.objectContaining({ node: { id: threadId } }),
    ]);
    await expect(
      context.sharingService.getReadableThread({
        workspaceId: context.workspaceId,
        workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
        threadId,
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.THREAD_NOT_FOUND });
  });

  it('rejects generic history mutations and sharing changes for a participant', async () => {
    const threadId = await createIdentity();
    const messageId = randomUUID();
    const otherThreadId = await context.createThread();

    await context.saveMessage({ threadId, id: messageId });

    const operations = [
      updateOneOperationFactory({
        objectMetadataSingularName: 'agentChatThread',
        recordId: threadId,
        gqlFields: 'id',
        data: { title: 'Changed through the generic API' },
      }),
      updateOneOperationFactory({
        objectMetadataSingularName: 'agentMessage',
        recordId: messageId,
        gqlFields: 'id',
        data: { threadId: otherThreadId },
      }),
      deleteOneOperationFactory({
        objectMetadataSingularName: 'agentChatThread',
        recordId: threadId,
        gqlFields: 'id',
      }),
      deleteOneOperationFactory({
        objectMetadataSingularName: 'agentMessage',
        recordId: messageId,
        gqlFields: 'id',
      }),
    ];

    for (const operation of operations) {
      const result = await makeGraphqlApiRequest(operation);

      expect(result.body.errors).toBeDefined();
    }

    const workspaceCacheService =
      getAppProviderByClassName<WorkspaceCacheService>('WorkspaceCacheService');
    const { flatObjectMetadataMaps } =
      await workspaceCacheService.getOrRecompute(context.workspaceId, [
        'flatObjectMetadataMaps',
      ]);
    const share = await makeMetadataApiRequest({
      query:
        parse(`mutation ShareDirectMessage($target: RecordTargetInput!, $principal: RecordSharePrincipalInput!) {
        setRecordShare(target: $target, principal: $principal, accessLevel: FULL) { canManageSharing }
      }`),
      variables: {
        target: {
          objectMetadataId:
            flatObjectMetadataMaps.byUniversalIdentifier[
              STANDARD_OBJECTS.agentChatThread.universalIdentifier
            ]!.id,
          recordId: threadId,
        },
        principal: { workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM },
      },
    });

    expect(share.body.errors).toBeDefined();

    const storedThread = await context.readThread(threadId);
    const storedMessage = await global.testDataSource
      .createQueryBuilder()
      .select(['"threadId"', '"deletedAt"'])
      .from(`${context.schema}.agentMessage`, 'message')
      .where('id = :messageId', { messageId })
      .getRawOne<{ threadId: string; deletedAt: Date | null }>();

    expect(storedThread.deletedAt).toBeNull();
    expect(storedMessage).toEqual({ threadId, deletedAt: null });
  });

  it('does not expose a direct message through a readable CRM record', async () => {
    const threadId = await createIdentity(WORKSPACE_MEMBER_DATA_SEED_IDS.TIM);
    const targetId = randomUUID();

    await global.testDataSource
      .createQueryBuilder()
      .insert()
      .into(`${context.schema}.agentChatThreadTarget`)
      .values({
        id: targetId,
        threadId,
        targetCompanyId: COMPANY_DATA_SEED_IDS.ID_1,
      })
      .execute();

    const company = await makeGraphqlApiRequest(
      findOneOperationFactory({
        objectMetadataSingularName: 'company',
        filter: { id: { eq: COMPANY_DATA_SEED_IDS.ID_1 } },
        gqlFields: `id agentChatThreadTargets(filter: { id: { eq: "${targetId}" } }) { edges { node { id thread { id } } } }`,
      }),
    );
    const targets = await makeGraphqlApiRequest(
      findManyOperationFactory({
        objectMetadataSingularName: 'agentChatThreadTarget',
        objectMetadataPluralName: 'agentChatThreadTargets',
        filter: { id: { eq: targetId } },
        gqlFields: 'id thread { id }',
      }),
    );

    expect(company.body.errors).toBeUndefined();
    expect(company.body.data.company).toEqual({
      id: COMPANY_DATA_SEED_IDS.ID_1,
      agentChatThreadTargets: { edges: [] },
    });
    expect(targets.body.errors).toBeUndefined();
    expect(targets.body.data.agentChatThreadTargets.edges).toEqual([]);
  });
});
