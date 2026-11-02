import { getAgentChatDirectMessagePeerOrThrow } from 'src/engine/metadata-modules/ai/ai-chat/utils/get-agent-chat-direct-message-peer-or-throw.util';

const FIRST_MEMBER_ID = '72c084c8-382a-4f5e-bda6-dac4a988f792';
const SECOND_MEMBER_ID = 'b3108f32-2084-4b2d-8ab3-31ecc82a1d3a';
const THREAD = {
  conversationType: 'DIRECT_MESSAGE' as const,
  directMessageFirstWorkspaceMemberId: FIRST_MEMBER_ID,
  directMessageSecondWorkspaceMemberId: SECOND_MEMBER_ID,
};

describe('getAgentChatDirectMessagePeerOrThrow', () => {
  it.each([
    { workspaceMemberId: FIRST_MEMBER_ID, peerId: SECOND_MEMBER_ID },
    {
      workspaceMemberId: SECOND_MEMBER_ID.toUpperCase(),
      peerId: FIRST_MEMBER_ID,
    },
  ])(
    'finds the other member from either side of the pair',
    ({ workspaceMemberId, peerId }) => {
      expect(
        getAgentChatDirectMessagePeerOrThrow({
          thread: THREAD,
          workspaceMemberId,
        }),
      ).toBe(peerId);
    },
  );

  it('does not reveal a peer to someone outside the pair', () => {
    expect(() =>
      getAgentChatDirectMessagePeerOrThrow({
        thread: THREAD,
        workspaceMemberId: 'fdb7f20f-ddcc-42d0-991b-9a478880a1cd',
      }),
    ).toThrow();
  });

  it('rejects incomplete identities', () => {
    expect(() =>
      getAgentChatDirectMessagePeerOrThrow({
        thread: { ...THREAD, directMessageSecondWorkspaceMemberId: null },
        workspaceMemberId: FIRST_MEMBER_ID,
      }),
    ).toThrow();
  });
});
