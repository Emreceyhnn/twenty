import { AGENT_CHAT_THREAD_LIST_RECORD_GQL_FIELDS } from '@/ai/constants/AgentChatThreadListRecordGqlFields';

export const getAgentChatThreadListRecordGqlFields = (
  isDirectMessageIdentityEnabled: boolean,
) => ({
  ...AGENT_CHAT_THREAD_LIST_RECORD_GQL_FIELDS,
  ...(isDirectMessageIdentityEnabled
    ? {
        conversationType: true,
        directMessageFirstWorkspaceMemberId: true,
        directMessageSecondWorkspaceMemberId: true,
      }
    : {}),
});
