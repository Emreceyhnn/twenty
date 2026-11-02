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
import { TriggerEventType } from '@/ui/navigation/types/TriggerEventType';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';
import { filterBySearchQuery } from '~/utils/filterBySearchQuery';

export const NavigationDrawerConnectedDirectMessagesSection = () => {
  const { t } = useLingui();
  const [searchValue, setSearchValue] = useState('');
  const currentMember = useAtomStateValue(currentWorkspaceMemberState);
  const workspace = useAtomStateValue(currentWorkspaceState);
  const members = useAtomStateValue(currentWorkspaceMembersState);
  const directMessages = useAtomStateValue(
    agentChatDirectMessageSidebarItemsSelector,
  );
  const currentThreadId = useAtomStateValue(currentAiChatThreadState);
  const loadedList = useAtomStateValue(agentChatDirectMessageListState);
  const list =
    loadedList?.workspaceId === workspace?.id &&
    loadedList?.workspaceMemberId === currentMember?.id
      ? loadedList
      : null;
  const loadingRequest = useAtomStateValue(
    agentChatDirectMessageListLoadingState,
  );
  const isLoading =
    isDefined(loadingRequest) &&
    loadingRequest.workspaceId === workspace?.id &&
    loadingRequest.workspaceMemberId === currentMember?.id;
  const { loadDirectMessages } = useLoadDirectMessages();
  const { openDirectMessage, isOpening } = useOpenDirectMessage();
  const { handleThreadClick } = useAiChatThreadClick({
    shouldOpenInFullPage: true,
  });
  const humanMembers = filterBySearchQuery({
    items: members.map((member) => ({
      workspaceMemberId: member.id,
      name: getWorkspaceMemberNameOrEmail(member),
      avatarUrl: getAbsoluteImageUrl(member.avatarUrl),
      email: member.userEmail,
    })),
    searchQuery: searchValue,
    getSearchableValues: ({ name, email }) => [name, email],
  });

  if (!isDefined(currentMember)) {
    return null;
  }

  return (
    <>
      <DirectMessagesLoadEffect />
      <NavigationDrawerDirectMessagesSection
        directMessages={directMessages}
        currentThreadId={currentThreadId}
        onSelect={(id) => handleThreadClick({ id })}
        memberPicker={
          <DirectMessageMemberPicker
            humanMembers={humanMembers}
            currentWorkspaceMemberId={currentMember.id}
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
              triggerEvent={TriggerEventType.CLICK}
              preventCollapseOnMobile
            />
          )
        }
      />
    </>
  );
};
