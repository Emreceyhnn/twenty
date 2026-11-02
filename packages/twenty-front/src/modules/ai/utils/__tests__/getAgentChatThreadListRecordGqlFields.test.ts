import { getAgentChatThreadListRecordGqlFields } from '@/ai/utils/getAgentChatThreadListRecordGqlFields';

describe('getAgentChatThreadListRecordGqlFields', () => {
  it('loads ordinary chats without requesting fields absent before the identity upgrade', () => {
    const fields = getAgentChatThreadListRecordGqlFields(false);

    expect(fields).toHaveProperty('lastActivityAt', true);
    expect(fields).not.toHaveProperty('directMessageFirstWorkspaceMemberId');
    expect(fields).not.toHaveProperty('directMessageSecondWorkspaceMemberId');
    expect(getAgentChatThreadListRecordGqlFields(true)).toHaveProperty(
      'directMessageFirstWorkspaceMemberId',
      true,
    );
  });
});
