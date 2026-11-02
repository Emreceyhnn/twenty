import { msg } from '@lingui/core/macro';
import { doNotTranslate } from 'twenty-shared/i18n';

import { type DirectMessageThreadPair } from 'src/engine/permissions/direct-message/types/direct-message-thread-pair.type';
import { hasDirectMessageThreadIdentity } from 'src/engine/permissions/direct-message/utils/has-direct-message-thread-identity.util';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

export const assertAgentChatThreadIsNotDirectMessageOrThrow = (
  thread: DirectMessageThreadPair,
): void => {
  if (!hasDirectMessageThreadIdentity(thread)) {
    return;
  }

  throw new AiException(
    doNotTranslate('This operation cannot change a canonical direct message'),
    AiExceptionCode.INVALID_AGENT_INPUT,
    {
      userFriendlyMessage: msg`This action is not available for direct messages.`,
    },
  );
};
