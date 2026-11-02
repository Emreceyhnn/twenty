import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { DirectMessageMemberPicker } from '@/ai/components/DirectMessageMemberPicker';
import { DirectMessagesLoadEffect } from '@/ai/components/DirectMessagesLoadEffect';
import { NavigationDrawerDirectMessagesSection } from '@/ai/components/NavigationDrawerDirectMessagesSection';
import { useAiChatThreadClick } from '@/ai/hooks/useAiChatThreadClick';
import { useLoadDirectMessages } from '@/ai/hooks/useLoadDirectMessages';
import { useOpenDirectMessage } from '@/ai/hooks/useOpenDirectMessage';
import { agentChatDirectMessageListState } from '@/ai/states/agentChatDirectMessageListState';
import { agentChatDirectMessageListLoadingState } from '@/ai/states/agentChatDirectMessageListLoadingState';
import { agentChatDirectMessageSidebarItemsSelector } from '@/ai/states/selectors/agentChatDirectMessageSidebarItemsSelector';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';
import { filterBySearchQuery } from '~/utils/filterBySearchQuery';

export const NavigationDrawerConnectedDirectMessagesSection = () => {
  const { t } = useLingui();
  const [searchValue, setSearchValue] = useState('');
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMembers = useAtomStateValue(
    currentWorkspaceMembersState,
  );
  const agentChatDirectMessageSidebarItems = useAtomStateValue(
    agentChatDirectMessageSidebarItemsSelector,
  );
  const currentAiChatThread = useAtomStateValue(currentAiChatThreadState);
  const agentChatDirectMessageList = useAtomStateValue(
    agentChatDirectMessageListState,
  );
  const list =
    agentChatDirectMessageList?.workspaceId === currentWorkspace?.id &&
    agentChatDirectMessageList?.workspaceMemberId === currentWorkspaceMember?.id
      ? agentChatDirectMessageList
      : null;
  const agentChatDirectMessageListLoading = useAtomStateValue(
    agentChatDirectMessageListLoadingState,
  );
  const isLoading =
    isDefined(agentChatDirectMessageListLoading) &&
    agentChatDirectMessageListLoading.workspaceId === currentWorkspace?.id &&
    agentChatDirectMessageListLoading.workspaceMemberId ===
      currentWorkspaceMember?.id;
  const { loadDirectMessages } = useLoadDirectMessages();
  const { openDirectMessage, isOpening } = useOpenDirectMessage();
  const { handleThreadClick } = useAiChatThreadClick({
    shouldOpenInFullPage: true,
  });
  const humanMembers = filterBySearchQuery({
    items: currentWorkspaceMembers.map((member) => ({
      workspaceMemberId: member.id,
      name: getWorkspaceMemberNameOrEmail(member),
      avatarUrl: getAbsoluteImageUrl(member.avatarUrl),
      email: member.userEmail,
    })),
    searchQuery: searchValue,
    getSearchableValues: ({ name, email }) => [name, email],
  });

  if (!isDefined(currentWorkspaceMember)) {
    return null;
  }

  return (
    <>
      <DirectMessagesLoadEffect />
      <NavigationDrawerDirectMessagesSection
        directMessages={agentChatDirectMessageSidebarItems}
        currentThreadId={currentAiChatThread}
        onSelect={(id) => handleThreadClick({ id })}
        memberPicker={
          <DirectMessageMemberPicker
            humanMembers={humanMembers}
            currentWorkspaceMemberId={currentWorkspaceMember.id}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            isLoading={isOpening}
            onSelect={(id) => void openDirectMessage(id)}
          />
        }
        footer={
          (!isDefined(list) || list.hasNextPage) && (
            <NavigationDrawerItem
              label={
                isLoading
                  ? t`Loading…`
                  : isDefined(list)
                    ? t`See more`
                    : t`Load direct messages`
              }
              onClick={() =>
                void loadDirectMessages(
                  isDefined(list) ? 'fetch-more' : 'refresh',
                )
              }
              triggerEvent="CLICK"
              preventCollapseOnMobile
            />
          )
        }
      />
    </>
  );
};
