import { AGENT_CHAT_THREAD_LIST_RECORD_GQL_FIELDS } from '@/ai/constants/AgentChatThreadListRecordGqlFields';
import { type RecordGqlFields } from 'twenty-shared/types';

export const getAgentChatThreadListRecordGqlFields = (
  isDirectMessageIdentityEnabled: boolean,
): RecordGqlFields => ({
  ...AGENT_CHAT_THREAD_LIST_RECORD_GQL_FIELDS,
  ...(isDirectMessageIdentityEnabled
    ? {
        conversationType: true,
        directMessageFirstWorkspaceMemberId: true,
        directMessageSecondWorkspaceMemberId: true,
      }
    : {}),
});
