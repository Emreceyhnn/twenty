import { useApolloClient } from '@apollo/client/react';
import { useStore } from 'jotai';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { v4 } from 'uuid';

import { useAiChatThreadClick } from '@/ai/hooks/useAiChatThreadClick';
import { useRefreshAgentChatThreads } from '@/ai/hooks/useRefreshAgentChatThreads';
import { useHandoffDirectMessageDraft } from '@/ai/hooks/useHandoffDirectMessageDraft';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { shouldFocusChatEditorState } from '@/ai/states/shouldFocusChatEditorState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { DirectMessageThreadDocument } from '~/generated-metadata/graphql';

export const useOpenDirectMessage = () => {
  const apolloClient = useApolloClient();
  const store = useStore();
  const { enqueueToast } = useToast();
  const { handleThreadClick } = useAiChatThreadClick({
    shouldOpenInFullPage: true,
  });
  const { loadAgentChatThread } = useRefreshAgentChatThreads();
  const { handoffDirectMessageDraft } = useHandoffDirectMessageDraft();
  const [isOpening, setIsOpening] = useState(false);

  const openDirectMessage = async (peerWorkspaceMemberId: string) => {
    const workspaceId = store.get(currentWorkspaceState.atom)?.id;
    const workspaceMemberId = store.get(currentWorkspaceMemberState.atom)?.id;
    const selectedThreadBeforeLookup = store.get(currentAiChatThreadState.atom);

    if (!isDefined(workspaceId) || !isDefined(workspaceMemberId) || isOpening) {
      return;
    }

    setIsOpening(true);

    try {
      const { data } = await apolloClient.query({
        query: DirectMessageThreadDocument,
        variables: { peerWorkspaceMemberId },
        fetchPolicy: 'network-only',
      });

      if (
        store.get(currentWorkspaceState.atom)?.id !== workspaceId ||
        store.get(currentWorkspaceMemberState.atom)?.id !== workspaceMemberId ||
        store.get(currentAiChatThreadState.atom) !== selectedThreadBeforeLookup
      ) {
        return;
      }

      const existingThreadId = data?.directMessageThread?.id;
      const drafts = store.get(agentChatDirectMessageDraftsState.atom);
      const existingDraft = Object.entries(drafts).find(
        ([, draft]) =>
          draft.workspaceId === workspaceId &&
          draft.workspaceMemberId === workspaceMemberId &&
          draft.peerWorkspaceMemberId === peerWorkspaceMemberId &&
          !isDefined(draft.canonicalThreadId),
      );

      if (isDefined(existingThreadId)) {
        if (isDefined(existingDraft)) {
          await handoffDirectMessageDraft({
            draftId: existingDraft[0],
            threadId: existingThreadId,
          });
        } else {
          await loadAgentChatThread(existingThreadId);
        }
        const selectedThreadAfterLoading = store.get(
          currentAiChatThreadState.atom,
        );
        if (
          store.get(currentWorkspaceState.atom)?.id !== workspaceId ||
          store.get(currentWorkspaceMemberState.atom)?.id !==
            workspaceMemberId ||
          (selectedThreadAfterLoading !== selectedThreadBeforeLookup &&
            selectedThreadAfterLoading !== existingThreadId)
        ) {
          return;
        }
        handleThreadClick({ id: existingThreadId });
        store.set(shouldFocusChatEditorState.atom, true);
        return;
      }

      const draftId = existingDraft?.[0] ?? v4();

      store.set(agentChatDirectMessageDraftsState.atom, {
        ...drafts,
        [draftId]: { workspaceId, workspaceMemberId, peerWorkspaceMemberId },
      });
      handleThreadClick({ id: draftId });
      store.set(shouldFocusChatEditorState.atom, true);
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    } finally {
      setIsOpening(false);
    }
  };

  return { openDirectMessage, isOpening };
};
