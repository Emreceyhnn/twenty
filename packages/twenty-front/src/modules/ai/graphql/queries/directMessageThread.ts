import { gql } from '@apollo/client';

export const DIRECT_MESSAGE_THREAD = gql`
  query DirectMessageThread($peerWorkspaceMemberId: UUID!) {
    directMessageThread(peerWorkspaceMemberId: $peerWorkspaceMemberId) {
      id
    }
  }
`;
