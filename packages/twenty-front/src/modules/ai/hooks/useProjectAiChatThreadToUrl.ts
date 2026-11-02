import { useStore } from 'jotai';
import { useCallback } from 'react';
import { AppPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { isObject } from '@sniptt/guards';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';

import { AI_CHAT_NEW_THREAD_PATH_SEGMENT } from '@/ai/constants/AiChatNewThreadPathSegment';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { useNavigateApp } from '~/hooks/useNavigateApp';
import { getCurrentHistoryEntryState } from '~/utils/getCurrentHistoryEntryState';
import { isAiChatInboxPath } from '~/utils/isAiChatInboxPath';
import { isCurrentPathAiChatPage } from '~/utils/isCurrentPathAiChatPage';
import { isMatchingPathname } from '~/utils/isMatchingPathname';

type UseProjectAiChatThreadToUrlParams = {
  shouldPreserveClosedInbox?: boolean;
};

export const useProjectAiChatThreadToUrl = ({
  shouldPreserveClosedInbox = false,
}: UseProjectAiChatThreadToUrlParams = {}) => {
  const navigateApp = useNavigateApp();
  const store = useStore();

  const projectAiChatThreadToUrl = useCallback(
    (threadId: string) => {
      const pathname = window.location.pathname;
      const isOnInboxPage = isAiChatInboxPath(pathname);
      const isInboxClosed = isMatchingPathname(
        pathname,
        getAppPath(AppPath.AiChatInbox, { threadId: null }),
      );

      if (shouldPreserveClosedInbox && isInboxClosed) {
        return;
      }

      if (!isCurrentPathAiChatPage() && !isOnInboxPage) {
        return;
      }

      const directMessageDraft = store.get(
        agentChatDirectMessageDraftsState.atom,
      )[threadId];
      const isDirectMessageDraft =
        isDefined(directMessageDraft) &&
        !isDefined(directMessageDraft.canonicalThreadId);
      const isNewChat =
        threadId === store.get(newAiChatThreadIdState.atom) ||
        isDirectMessageDraft;
      const newThreadPathSegment =
        isOnInboxPage || isDirectMessageDraft
          ? AI_CHAT_NEW_THREAD_PATH_SEGMENT
          : null;
      const historyState = getCurrentHistoryEntryState();

      navigateApp(
        isOnInboxPage ? AppPath.AiChatInbox : AppPath.AiChat,
        {
          threadId: isNewChat ? newThreadPathSegment : threadId,
        },
        undefined,
        {
          replace: !isInboxClosed,
          state: {
            ...(isObject(historyState) ? historyState : {}),
            directMessageDraftThreadId: isDirectMessageDraft
              ? threadId
              : undefined,
          },
        },
      );
    },
    [navigateApp, shouldPreserveClosedInbox, store],
  );

  return { projectAiChatThreadToUrl };
};
