import { FeatureFlagKey } from 'twenty-shared/types';

import { AgentChatDirectMessageService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-direct-message.service';
import { type AgentChatThreadWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-chat-thread.workspace-entity';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

const WORKSPACE_ID = '147d5093-6260-4906-81b3-a970c56557b6';
const FIRST_MEMBER_ID = '72c084c8-382a-4f5e-bda6-dac4a988f792';
const SECOND_MEMBER_ID = 'b3108f32-2084-4b2d-8ab3-31ecc82a1d3a';
const OUTSIDER_ID = 'fdb7f20f-ddcc-42d0-991b-9a478880a1cd';
const THREAD = {
  id: '2b8d3796-2f89-46cf-a853-f31117da4d6b',
  conversationType: 'DIRECT_MESSAGE',
  directMessageFirstWorkspaceMemberId: FIRST_MEMBER_ID,
  directMessageSecondWorkspaceMemberId: SECOND_MEMBER_ID,
  channelId: null,
} as AgentChatThreadWorkspaceEntity;
const ACCESS = {
  workspaceId: WORKSPACE_ID,
  workspaceMemberId: FIRST_MEMBER_ID,
  peerWorkspaceMemberId: SECOND_MEMBER_ID,
};

const buildService = () => {
  const threadRepository = { findOne: jest.fn().mockResolvedValue(null) };
  const identityService = { getOrCreate: jest.fn() };
  const sharingService = {
    getReadableThread: jest.fn().mockResolvedValue(THREAD),
    getAuthContext: jest.fn().mockResolvedValue({}),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      featureFlagsMap: {
        [FeatureFlagKey.IS_AI_CHAT_INBOX_ENABLED]: true,
        [FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED]: true,
      },
    }),
  };
  const service = new AgentChatDirectMessageService();

  Object.assign(service, {
    threadRepository,
    identityService,
    sharingService,
    workspaceCacheService,
  });

  return { service, threadRepository, identityService, sharingService };
};

describe('AgentChatDirectMessageService', () => {
  it('does not allocate a thread when the picker looks up a missing pair', async () => {
    const { service, identityService } = buildService();

    await expect(service.find(ACCESS)).resolves.toBeNull();
    expect(identityService.getOrCreate).not.toHaveBeenCalled();
  });

  it('does not reveal an existing thread without read access', async () => {
    const { service, threadRepository, sharingService } = buildService();

    threadRepository.findOne.mockResolvedValue(THREAD);
    sharingService.getReadableThread.mockRejectedValue(
      new AiException('Thread not found', AiExceptionCode.THREAD_NOT_FOUND),
    );

    await expect(service.find(ACCESS)).resolves.toBeNull();
  });

  it('derives first-send delivery from the fixed pair when recipients are omitted', async () => {
    const { service } = buildService();

    await expect(
      service.resolveMessageRecipientIds({
        ...ACCESS,
        thread: THREAD,
        recipientWorkspaceMemberIds: [],
        mentionedWorkspaceMemberIds: [],
      }),
    ).resolves.toEqual([SECOND_MEMBER_ID]);
  });

  it.each([
    {
      channelId: OUTSIDER_ID,
      recipientWorkspaceMemberIds: [],
      mentionedWorkspaceMemberIds: [],
    },
    {
      channelId: null,
      recipientWorkspaceMemberIds: [OUTSIDER_ID],
      mentionedWorkspaceMemberIds: [],
    },
    {
      channelId: null,
      recipientWorkspaceMemberIds: [],
      mentionedWorkspaceMemberIds: [OUTSIDER_ID],
    },
  ])('rejects channels and additional humans', async (recipients) => {
    const { service } = buildService();

    await expect(
      service.resolveMessageRecipientIds({
        ...ACCESS,
        thread: THREAD,
        ...recipients,
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.INVALID_AGENT_INPUT });
  });
});
