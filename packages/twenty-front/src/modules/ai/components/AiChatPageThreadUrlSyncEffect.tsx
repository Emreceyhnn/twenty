import { useStore } from 'jotai';
import { useLayoutEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { isObject, isString } from '@sniptt/guards';
import { agentChatDirectMessageDraftFamilySelector } from '@/ai/states/selectors/agentChatDirectMessageDraftFamilySelector';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useProjectAiChatThreadToUrl } from '@/ai/hooks/useProjectAiChatThreadToUrl';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { AI_CHAT_NEW_THREAD_PATH_SEGMENT } from '@/ai/constants/AiChatNewThreadPathSegment';
import { useRefreshAgentChatThreads } from '@/ai/hooks/useRefreshAgentChatThreads';
import { useSwitchAgentChatThreadWithDraft } from '@/ai/hooks/useSwitchAgentChatThreadWithDraft';
import { useSwitchToNewAiChat } from '@/ai/hooks/useSwitchToNewAiChat';
import { agentChatThreadListState } from '@/ai/states/agentChatThreadListState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { currentAiChatThreadDataSelector } from '@/ai/states/selectors/currentAiChatThreadDataSelector';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const THREAD_LOAD_RETRY_DELAY_IN_MS = 3_000;

export const AiChatPageThreadUrlSyncEffect = () => {
  const store = useStore();
  const { threadId } = useParams();
  const location = useLocation();
  const routeDraftId =
    isObject(location.state) &&
    isString(location.state.directMessageDraftThreadId)
      ? location.state.directMessageDraftThreadId
      : undefined;
  const directMessageDraft = useAtomFamilySelectorValue(
    agentChatDirectMessageDraftFamilySelector,
    routeDraftId ?? '',
  );
  const { projectAiChatThreadToUrl } = useProjectAiChatThreadToUrl();
  const [newRouteThreadId] = useState(() =>
    store.get(newAiChatThreadIdState.atom),
  );
  const isNewThreadRoute = threadId === AI_CHAT_NEW_THREAD_PATH_SEGMENT;
  const selectedThreadId = isNewThreadRoute
    ? (directMessageDraft?.canonicalThreadId ??
      (isDefined(directMessageDraft) ? routeDraftId : newRouteThreadId))
    : threadId;
  const currentAiChatThread = useAtomStateValue(currentAiChatThreadState);
  const currentAiChatThreadData = useAtomStateValue(
    currentAiChatThreadDataSelector,
  );
  const areAgentChatThreadsLoaded =
    useAtomStateValue(agentChatThreadListState) !== null;
  const { switchThreadWithDraft } = useSwitchAgentChatThreadWithDraft();
  const { loadAgentChatThread } = useRefreshAgentChatThreads();
  const { switchToNewChat } = useSwitchToNewAiChat({
    shouldOpenInFullPage: true,
  });

  useLayoutEffect(() => {
    if (!isDefined(selectedThreadId) || !isValidUuid(selectedThreadId)) {
      return;
    }

    if (selectedThreadId !== currentAiChatThread) {
      switchThreadWithDraft(selectedThreadId);
      return;
    }

    if (isNewThreadRoute) {
      if (isDefined(directMessageDraft?.canonicalThreadId)) {
        projectAiChatThreadToUrl(directMessageDraft.canonicalThreadId);
      }
      return;
    }

    if (areAgentChatThreadsLoaded && !isDefined(currentAiChatThreadData)) {
      let isCurrentThread = true;
      let retryTimeout: ReturnType<typeof setTimeout> | undefined;

      const loadSelectedThread = async () => {
        const chatThread = await loadAgentChatThread(selectedThreadId).catch(
          () => undefined,
        );
        if (!isCurrentThread) {
          return;
        }

        if (chatThread === null) {
          switchToNewChat();
          return;
        }

        if (!isDefined(chatThread)) {
          retryTimeout = setTimeout(
            () => void loadSelectedThread(),
            THREAD_LOAD_RETRY_DELAY_IN_MS,
          );
        }
      };

      void loadSelectedThread();

      return () => {
        isCurrentThread = false;
        clearTimeout(retryTimeout);
      };
    }
  }, [
    selectedThreadId,
    isNewThreadRoute,
    currentAiChatThread,
    currentAiChatThreadData,
    areAgentChatThreadsLoaded,
    loadAgentChatThread,
    switchThreadWithDraft,
    switchToNewChat,
    directMessageDraft,
    projectAiChatThreadToUrl,
  ]);

  return null;
};
