import { getDirectMessagePeerId } from '@/ai/utils/getDirectMessagePeerId';

const THREAD = {
  conversationType: 'DIRECT_MESSAGE' as const,
  directMessageFirstWorkspaceMemberId: 'anna',
  directMessageSecondWorkspaceMemberId: 'felix',
};

describe('getDirectMessagePeerId', () => {
  it('identifies the other member from either side of the canonical pair', () => {
    expect(
      getDirectMessagePeerId({
        thread: THREAD,
        currentWorkspaceMemberId: 'anna',
      }),
    ).toBe('felix');
    expect(
      getDirectMessagePeerId({
        thread: THREAD,
        currentWorkspaceMemberId: 'felix',
      }),
    ).toBe('anna');
  });

  it('does not present an ordinary chat or an outsider as a direct-message peer', () => {
    expect(
      getDirectMessagePeerId({
        thread: THREAD,
        currentWorkspaceMemberId: 'alice',
      }),
    ).toBeNull();
    expect(
      getDirectMessagePeerId({
        thread: { ...THREAD, conversationType: 'STANDARD' },
        currentWorkspaceMemberId: 'anna',
      }),
    ).toBeNull();
  });
});
