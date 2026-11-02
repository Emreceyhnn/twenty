import { type AgentChatThreadRecord } from '@/ai/types/AgentChatThreadRecord';
import { isDefined } from 'twenty-shared/utils';

export const isSavedDirectMessage = (thread: AgentChatThreadRecord) =>
  thread.conversationType === 'DIRECT_MESSAGE' &&
  !isDefined(thread.deletedAt) &&
  isDefined(thread.lastActivityAt);
