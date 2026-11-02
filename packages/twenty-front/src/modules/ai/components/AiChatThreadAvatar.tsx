import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { Avatar, type AvatarSize } from 'twenty-ui/primitives/data-display';

import { useAgentChatThreadMembers } from '@/ai/hooks/useAgentChatThreadMembers';
import { useAiChatDirectMessage } from '@/ai/hooks/useAiChatDirectMessage';
import { type AgentChatThreadRecord } from '@/ai/types/AgentChatThreadRecord';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';
import { WorkspaceMemberAvatarStack } from '@/workspace-member/components/WorkspaceMemberAvatarStack';

type AiChatThreadAvatarProps = {
  thread: AgentChatThreadRecord;
  size?: AvatarSize;
};

export const AiChatThreadAvatar = ({
  thread,
  size = 'lg',
}: AiChatThreadAvatarProps) => {
  const { t } = useLingui();
  const threadMembers = useAgentChatThreadMembers(thread);
  const { peer } = useAiChatDirectMessage(thread.id);

  if (isDefined(peer)) {
    return (
      <Avatar
        name={peer.name}
        src={peer.avatarUrl}
        colorSeed={peer.workspaceMemberId}
        size={size}
        shape="circle"
      />
    );
  }

  const [onlyMember, secondMember] = threadMembers;

  if (isDefined(onlyMember) && !isDefined(secondMember)) {
    const name = getWorkspaceMemberNameOrEmail(onlyMember);

    return (
      <Avatar
        src={getAbsoluteImageUrl(onlyMember.avatarUrl)}
        name={name}
        imageProps={{ alt: name }}
        colorSeed={onlyMember.id}
        size={size}
        shape="circle"
      />
    );
  }

  return (
    <WorkspaceMemberAvatarStack
      workspaceMembers={threadMembers}
      defaultAvatarName={t`Member`}
      maxVisible={2}
    />
  );
};
