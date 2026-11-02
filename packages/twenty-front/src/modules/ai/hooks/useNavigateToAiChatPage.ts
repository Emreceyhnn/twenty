import { AppPath } from 'twenty-shared/types';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { useStore } from 'jotai';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { AI_CHAT_NEW_THREAD_PATH_SEGMENT } from '@/ai/constants/AiChatNewThreadPathSegment';

import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { useNavigateApp } from '~/hooks/useNavigateApp';
import { isCurrentPathAiChatPage } from '~/utils/isCurrentPathAiChatPage';

export const useNavigateToAiChatPage = () => {
  const store = useStore();
  const navigate = useNavigateApp();
  const { closeSidePanelMenu } = useSidePanelMenu();

  const navigateToAiChatPage = ({
    threadId,
  }: {
    threadId?: string | null;
  } = {}) => {
    if (
      store.get(isLayoutCustomizationModeEnabledState.atom) ||
      isCurrentPathAiChatPage()
    ) {
      return;
    }

    void closeSidePanelMenu();

    const draft = store.get(agentChatDirectMessageDraftsState.atom)[
      threadId ?? ''
    ];
    const isDirectMessageDraft =
      isDefined(draft) && !isDefined(draft.canonicalThreadId);

    navigate(
      AppPath.AiChat,
      {
        threadId: isDirectMessageDraft
          ? AI_CHAT_NEW_THREAD_PATH_SEGMENT
          : isDefined(threadId) && isValidUuid(threadId)
            ? threadId
            : null,
      },
      undefined,
      {
        state: {
          directMessageDraftThreadId: isDirectMessageDraft
            ? threadId
            : undefined,
          // Read from the window rather than useLocation so that opening a new
          // chat does not require a router context from every caller of
          // useSwitchToNewAiChat, front components included.
          returnLocation: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        },
      },
    );
  };

  return { navigateToAiChatPage };
};
