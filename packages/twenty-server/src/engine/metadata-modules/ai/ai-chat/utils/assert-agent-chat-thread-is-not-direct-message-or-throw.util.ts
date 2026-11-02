import { msg } from '@lingui/core/macro';

import { type AgentChatThreadWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-chat-thread.workspace-entity';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

export const assertAgentChatThreadIsNotDirectMessageOrThrow = (
  thread: Pick<AgentChatThreadWorkspaceEntity, 'conversationType'>,
): void => {
  if (thread.conversationType !== 'DIRECT_MESSAGE') {
    return;
  }

  throw new AiException(
    'This operation cannot change a canonical direct message',
    AiExceptionCode.INVALID_AGENT_INPUT,
    {
      userFriendlyMessage: msg`This action is not available for direct messages.`,
    },
  );
};
