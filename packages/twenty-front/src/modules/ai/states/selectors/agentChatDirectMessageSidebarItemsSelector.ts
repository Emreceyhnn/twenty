import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { agentChatDirectMessagesSelector } from '@/ai/states/selectors/agentChatDirectMessagesSelector';
import { agentChatThreadInboxStatusFamilySelector } from '@/ai/states/selectors/agentChatThreadInboxStatusFamilySelector';
import { type DirectMessageSidebarItem } from '@/ai/types/DirectMessageSidebarItem';
import { getDirectMessagePeerId } from '@/ai/utils/getDirectMessagePeerId';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { createAtomSelector } from '@/ui/utilities/state/jotai/utils/createAtomSelector';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

export const agentChatDirectMessageSidebarItemsSelector = createAtomSelector<
  DirectMessageSidebarItem[]
>({
  key: 'agentChatDirectMessageSidebarItemsSelector',
  get: ({ get }) => {
    const currentWorkspaceMemberId = get(currentWorkspaceMemberState)?.id;
    const members = get(currentWorkspaceMembersState);

    return get(agentChatDirectMessagesSelector).flatMap((thread) => {
      const peerId = getDirectMessagePeerId({
        thread,
        currentWorkspaceMemberId,
      });

      if (!isDefined(peerId)) {
        return [];
      }

      const member = members.find(({ id }) => id === peerId);

      return [
        {
          threadId: thread.id,
          peer: {
            workspaceMemberId: peerId,
            name: isDefined(member)
              ? getWorkspaceMemberNameOrEmail(member)
              : t`Former member`,
            avatarUrl: getAbsoluteImageUrl(member?.avatarUrl),
            email: member?.userEmail,
          },
          isUnread: get(agentChatThreadInboxStatusFamilySelector, thread.id)
            .isUnread,
        },
      ];
    });
  },
});
