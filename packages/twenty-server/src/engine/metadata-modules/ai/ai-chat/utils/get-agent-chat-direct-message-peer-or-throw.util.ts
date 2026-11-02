import { isDefined } from 'twenty-shared/utils';

import { type AgentChatThreadWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-chat-thread.workspace-entity';
import { throwAgentChatThreadNotFound } from 'src/engine/metadata-modules/ai/ai-chat/utils/throw-agent-chat-thread-not-found.util';

export const getAgentChatDirectMessagePeerOrThrow = ({
  thread,
  workspaceMemberId,
}: {
  thread: Pick<
    AgentChatThreadWorkspaceEntity,
    | 'conversationType'
    | 'directMessageFirstWorkspaceMemberId'
    | 'directMessageSecondWorkspaceMemberId'
  >;
  workspaceMemberId: string;
}): string => {
  const {
    directMessageFirstWorkspaceMemberId,
    directMessageSecondWorkspaceMemberId,
  } = thread;

  if (
    thread.conversationType !== 'DIRECT_MESSAGE' ||
    !isDefined(directMessageFirstWorkspaceMemberId) ||
    !isDefined(directMessageSecondWorkspaceMemberId) ||
    directMessageFirstWorkspaceMemberId === directMessageSecondWorkspaceMemberId
  ) {
    return throwAgentChatThreadNotFound();
  }

  if (workspaceMemberId.toLowerCase() === directMessageFirstWorkspaceMemberId) {
    return directMessageSecondWorkspaceMemberId;
  }

  if (
    workspaceMemberId.toLowerCase() === directMessageSecondWorkspaceMemberId
  ) {
    return directMessageFirstWorkspaceMemberId;
  }

  return throwAgentChatThreadNotFound();
};
