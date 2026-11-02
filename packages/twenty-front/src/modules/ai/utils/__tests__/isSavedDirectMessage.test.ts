import { type AgentChatThreadRecord } from '@/ai/types/AgentChatThreadRecord';
import { isSavedDirectMessage } from '@/ai/utils/isSavedDirectMessage';

const THREAD: AgentChatThreadRecord = {
  __typename: 'AgentChatThread',
  id: 'direct-message',
  title: null,
  conversationType: 'DIRECT_MESSAGE',
  deletedAt: null,
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  lastActivityAt: null,
  lastMessageText: null,
};

describe('isSavedDirectMessage', () => {
  it('excludes empty identities and includes saved attachment-only conversations', () => {
    expect(isSavedDirectMessage(THREAD)).toBe(false);
    expect(
      isSavedDirectMessage({ ...THREAD, lastActivityAt: THREAD.updatedAt }),
    ).toBe(true);
  });

  it('excludes deleted conversations and ordinary chats', () => {
    expect(
      isSavedDirectMessage({
        ...THREAD,
        lastActivityAt: THREAD.updatedAt,
        deletedAt: THREAD.updatedAt,
      }),
    ).toBe(false);
    expect(
      isSavedDirectMessage({
        ...THREAD,
        lastActivityAt: THREAD.updatedAt,
        conversationType: 'STANDARD',
      }),
    ).toBe(false);
  });
});
