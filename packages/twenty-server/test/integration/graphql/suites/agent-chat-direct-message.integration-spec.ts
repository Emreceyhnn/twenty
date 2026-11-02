import { randomUUID } from 'node:crypto';

import { parse } from 'graphql';
import { createChatParticipationTestContext } from 'test/integration/ai/utils/create-chat-participation-test-context.util';
import { runWithRejectedChatWrite } from 'test/integration/ai/utils/run-with-rejected-chat-write.util';
import { sendChatParticipationMessage } from 'test/integration/graphql/utils/send-chat-participation-message.util';
import { makeMetadataApiRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { getAppProviderByClassName } from 'test/integration/utils/get-app-provider-by-class-name.util';
import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { AiChatAssistantMode } from 'src/engine/core-modules/workspace/enums/ai-chat-assistant-mode.enum';
import { type AgentChatDirectMessageIdentityService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-direct-message-identity.service';
import { type AgentChatQueueService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-queue.service';
import { normalizeAgentChatDirectMessagePairOrThrow } from 'src/engine/metadata-modules/ai/ai-chat/utils/normalize-agent-chat-direct-message-pair-or-throw.util';
import { type AgentChatThreadWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-chat-thread.workspace-entity';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

const PEER_WORKSPACE_MEMBER_ID = WORKSPACE_MEMBER_DATA_SEED_IDS.JONY;

const lookupDirectMessage = ({
  peerWorkspaceMemberId,
  token,
}: {
  peerWorkspaceMemberId: string;
  token?: string;
}) =>
  makeMetadataApiRequest(
    {
      query: parse(`query DirectMessage($peerWorkspaceMemberId: UUID!) {
    directMessageThread(peerWorkspaceMemberId: $peerWorkspaceMemberId) { id }
  }`),
      variables: { peerWorkspaceMemberId },
    },
    token,
  );

const cancelQueuedMessage = ({
  messageId,
  token,
}: {
  messageId: string;
  token?: string;
}) =>
  makeMetadataApiRequest(
    {
      query: parse(
        `mutation CancelMessage($messageId: UUID!) { deleteQueuedChatMessage(messageId: $messageId) }`,
      ),
      variables: { messageId },
    },
    token,
  );

describe('Canonical direct messages through the authenticated API', () => {
  let context: Awaited<ReturnType<typeof createChatParticipationTestContext>>;
  let workspaceOrmManager: WorkspaceOrmManager;

  const findPairThreads = () =>
    workspaceOrmManager.executeInWorkspaceContext(
      () =>
        workspaceOrmManager
          .getRepository<AgentChatThreadWorkspaceEntity>('agentChatThread', {
            shouldBypassPermissionChecks: true,
          })
          .find({
            where: normalizeAgentChatDirectMessagePairOrThrow({
              firstWorkspaceMemberId: context.workspaceMemberId,
              secondWorkspaceMemberId: PEER_WORKSPACE_MEMBER_ID,
            }),
          }),
      buildSystemAuthContext(context.workspaceId),
      { lite: true },
    );

  beforeEach(async () => {
    context = await createChatParticipationTestContext();
    workspaceOrmManager = getAppProviderByClassName<WorkspaceOrmManager>(
      'WorkspaceOrmManager',
    );
    await context.setAssistantModes({
      aiChatDirectMessageAssistantMode: AiChatAssistantMode.NEVER,
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    if (!isDefined(context)) {
      return;
    }

    for (const thread of await findPairThreads()) {
      context.registerThread(thread.id);
    }

    await context.cleanup();
  });

  it('looks up a picker selection without allocating a canonical thread', async () => {
    const response = await lookupDirectMessage({
      peerWorkspaceMemberId: PEER_WORKSPACE_MEMBER_ID,
    });

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.directMessageThread).toBeNull();
    expect(await findPairThreads()).toEqual([]);
  });

  it('converges simultaneous reversed first sends on one thread with both participants and messages', async () => {
    const firstMessageId = randomUUID();
    const secondMessageId = randomUUID();
    const responses = await Promise.all([
      sendChatParticipationMessage({
        threadId: randomUUID(),
        messageId: firstMessageId,
        directMessageWorkspaceMemberId: PEER_WORKSPACE_MEMBER_ID,
      }),
      sendChatParticipationMessage({
        threadId: randomUUID(),
        messageId: secondMessageId,
        directMessageWorkspaceMemberId: context.workspaceMemberId,
        token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
      }),
    ]);

    for (const response of responses) {
      expect(response.body.errors).toBeUndefined();
    }

    const [thread] = await findPairThreads();

    assertIsDefinedOrThrow(thread);
    expect(await findPairThreads()).toHaveLength(1);
    expect(
      responses.map(({ body }) => body.data.sendChatMessage.threadId),
    ).toEqual([thread.id, thread.id]);
    expect(thread.lastActivityAt).not.toBeNull();
    expect(
      (await context.readParticipants(thread.id))
        .map(({ workspaceMemberId }) => workspaceMemberId)
        .sort(),
    ).toEqual([context.workspaceMemberId, PEER_WORKSPACE_MEMBER_ID].sort());

    for (const messageId of [firstMessageId, secondMessageId]) {
      expect(
        await context.chatService.hasMessage({
          workspaceId: context.workspaceId,
          workspaceMemberId: context.workspaceMemberId,
          threadId: thread.id,
          messageId,
        }),
      ).toBe(true);
    }

    const lookup = await lookupDirectMessage({
      peerWorkspaceMemberId: context.workspaceMemberId,
      token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
    });

    expect(lookup.body.errors).toBeUndefined();
    expect(lookup.body.data.directMessageThread.id).toBe(thread.id);
  });

  it('leaves no participants or visible history after a rejected first message and supports retry', async () => {
    const identityService =
      getAppProviderByClassName<AgentChatDirectMessageIdentityService>(
        'AgentChatDirectMessageIdentityService',
      );
    const threadId = context.registerThread(
      await identityService.getOrCreate({
        workspaceId: context.workspaceId,
        firstWorkspaceMemberId: context.workspaceMemberId,
        secondWorkspaceMemberId: PEER_WORKSPACE_MEMBER_ID,
      }),
    );
    const response = await runWithRejectedChatWrite({
      workspaceId: context.workspaceId,
      threadId,
      operation: 'message',
      work: async () =>
        sendChatParticipationMessage({
          threadId: randomUUID(),
          directMessageWorkspaceMemberId: PEER_WORKSPACE_MEMBER_ID,
        }),
    });

    expect(response.body.errors).toBeDefined();
    expect((await context.readThread(threadId)).lastActivityAt).toBeNull();
    expect(await context.readParticipants(threadId)).toEqual([]);
    expect(
      await context.chatService.hasMessages({
        workspaceId: context.workspaceId,
        threadId,
      }),
    ).toBe(false);

    const retry = await sendChatParticipationMessage({ threadId });

    expect(retry.body.errors).toBeUndefined();
    expect(retry.body.data.sendChatMessage.threadId).toBe(threadId);
    expect((await context.readThread(threadId)).lastActivityAt).not.toBeNull();
    expect(await context.readParticipants(threadId)).toHaveLength(2);
  });

  it('allows only the queued message sender to cancel it', async () => {
    const sent = await sendChatParticipationMessage({
      threadId: randomUUID(),
      directMessageWorkspaceMemberId: PEER_WORKSPACE_MEMBER_ID,
    });

    expect(sent.body.errors).toBeUndefined();

    const threadId = sent.body.data.sendChatMessage.threadId;
    const queue = getAppProviderByClassName<AgentChatQueueService>(
      'AgentChatQueueService',
    );
    const queued = await queue.queueMessage({
      workspaceId: context.workspaceId,
      workspaceMemberId: context.workspaceMemberId,
      userWorkspaceId: context.userWorkspaceId,
      threadId,
      text: 'Queued message',
    });
    const peerCancellation = await cancelQueuedMessage({
      messageId: queued.id,
      token: APPLE_JONY_MEMBER_ACCESS_TOKEN,
    });

    expect(peerCancellation.body.errors).toBeDefined();
    expect(
      await queue.findQueuedMessage({
        workspaceId: context.workspaceId,
        messageId: queued.id,
      }),
    ).not.toBeNull();

    const senderCancellation = await cancelQueuedMessage({
      messageId: queued.id,
    });

    expect(senderCancellation.body.errors).toBeUndefined();
    expect(senderCancellation.body.data.deleteQueuedChatMessage).toBe(true);
    expect(
      await queue.findQueuedMessage({
        workspaceId: context.workspaceId,
        messageId: queued.id,
      }),
    ).toBeNull();
  });
});
