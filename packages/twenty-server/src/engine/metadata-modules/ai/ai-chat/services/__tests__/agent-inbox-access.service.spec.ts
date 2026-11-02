import { type ApplicationWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { AgentInboxAccessService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-inbox-access.service';
import { type AgentChatThreadConversationType } from 'src/engine/metadata-modules/ai/ai-history/types/agent-chat-thread-conversation-type.type';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';

const WORKSPACE_ID = 'workspace-id';
const THREAD_ID = 'thread-id';
const APPLICATION_ID = 'application-id';
const APPLICATION_ROLE_ID = 'application-role-id';
const AUTH_CONTEXT = {
  type: 'application',
  workspace: { id: WORKSPACE_ID },
  application: { id: APPLICATION_ID, defaultRoleId: APPLICATION_ROLE_ID },
} as ApplicationWorkspaceAuthContext;

const buildService = ({
  conversationType,
  hasApplicationMessage,
  isWritableByRole,
}: {
  conversationType: AgentChatThreadConversationType;
  hasApplicationMessage: boolean;
  isWritableByRole: boolean;
}) =>
  new AgentInboxAccessService(
    { existsBy: jest.fn().mockResolvedValue(hasApplicationMessage) } as never,
    {
      findOne: jest.fn().mockResolvedValue({
        id: THREAD_ID,
        conversationType,
        directMessageFirstWorkspaceMemberId:
          conversationType === 'DIRECT_MESSAGE' ? 'first-member-id' : null,
        directMessageSecondWorkspaceMemberId:
          conversationType === 'DIRECT_MESSAGE' ? 'second-member-id' : null,
      }),
    } as never,
    { getWritableThread: jest.fn() } as never,
    {
      isThreadWritableByRole: jest.fn().mockResolvedValue(isWritableByRole),
    } as never,
  );

describe('AgentInboxAccessService', () => {
  it('denies application-only DM access despite prior participation and a role grant', async () => {
    const service = buildService({
      conversationType: 'DIRECT_MESSAGE',
      hasApplicationMessage: true,
      isWritableByRole: true,
    });

    await expect(
      service.assertThreadIsWritableOrThrow({
        authContext: AUTH_CONTEXT,
        threadId: THREAD_ID,
      }),
    ).rejects.toMatchObject({ code: AiExceptionCode.THREAD_NOT_FOUND });
  });

  it('preserves participation and role-based application access to ordinary chats', async () => {
    for (const hasApplicationMessage of [true, false]) {
      const service = buildService({
        conversationType: 'STANDARD',
        hasApplicationMessage,
        isWritableByRole: !hasApplicationMessage,
      });

      await expect(
        service.assertThreadIsWritableOrThrow({
          authContext: AUTH_CONTEXT,
          threadId: THREAD_ID,
        }),
      ).resolves.toBeUndefined();
    }
  });
});
