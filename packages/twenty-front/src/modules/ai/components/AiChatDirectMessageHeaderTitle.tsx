import { isDefined } from 'twenty-shared/utils';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { Text } from 'twenty-ui/primitives/typography';

import { useAiChatDirectMessage } from '@/ai/hooks/useAiChatDirectMessage';

export const AiChatDirectMessageHeaderTitle = ({
  threadId,
}: {
  threadId: string;
}) => {
  const { peer } = useAiChatDirectMessage(threadId);

  if (!isDefined(peer)) {
    return null;
  }

  return (
    <>
      <Avatar
        name={peer.name}
        src={peer.avatarUrl}
        colorSeed={peer.workspaceMemberId}
        size="md"
        shape="circle"
      />
      <Text size="md" weight="medium" truncate>
        {peer.name}
      </Text>
    </>
  );
};
