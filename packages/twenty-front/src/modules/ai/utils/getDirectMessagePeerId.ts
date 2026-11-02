import { type AgentChatThreadRecord } from '@/ai/types/AgentChatThreadRecord';
import { isDefined } from 'twenty-shared/utils';

export const getDirectMessagePeerId = ({
  thread,
  currentWorkspaceMemberId,
}: {
  thread:
    | Pick<
        AgentChatThreadRecord,
        | 'conversationType'
        | 'directMessageFirstWorkspaceMemberId'
        | 'directMessageSecondWorkspaceMemberId'
      >
    | null
    | undefined;
  currentWorkspaceMemberId: string | undefined;
}): string | null => {
  if (
    thread?.conversationType !== 'DIRECT_MESSAGE' ||
    !isDefined(currentWorkspaceMemberId)
  ) {
    return null;
  }

  if (thread.directMessageFirstWorkspaceMemberId === currentWorkspaceMemberId) {
    return thread.directMessageSecondWorkspaceMemberId ?? null;
  }

  if (
    thread.directMessageSecondWorkspaceMemberId === currentWorkspaceMemberId
  ) {
    return thread.directMessageFirstWorkspaceMemberId ?? null;
  }

  return null;
};
