import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useProjectAiChatThreadToUrl } from '@/ai/hooks/useProjectAiChatThreadToUrl';
import { useRefreshAgentChatThreads } from '@/ai/hooks/useRefreshAgentChatThreads';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { agentChatDirectMessageUploadedFilesFamilyState } from '@/ai/states/agentChatDirectMessageUploadedFilesFamilyState';
import { agentChatDirectMessageSelectedFilesFamilyState } from '@/ai/states/agentChatDirectMessageSelectedFilesFamilyState';
import { agentChatDraftsByThreadIdState } from '@/ai/states/agentChatDraftsByThreadIdState';
import { agentChatMessagesFamilyState } from '@/ai/states/agentChatMessagesFamilyState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { mergeAgentChatDrafts } from '@/ai/utils/mergeAgentChatDrafts';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';

export const useHandoffDirectMessageDraft = () => {
  const store = useStore();
  const { loadAgentChatThread } = useRefreshAgentChatThreads();
  const { projectAiChatThreadToUrl } = useProjectAiChatThreadToUrl({
    shouldPreserveClosedInbox: true,
  });

  const handoffDirectMessageDraft = useCallback(
    async ({ draftId, threadId }: { draftId: string; threadId: string }) => {
      const draft = store.get(agentChatDirectMessageDraftsState.atom)[draftId];

      if (!isDefined(draft)) {
        return;
      }

      await loadAgentChatThread(threadId).catch(() => undefined);

      if (
        draft.workspaceId !== store.get(currentWorkspaceState.atom)?.id ||
        draft.workspaceMemberId !==
          store.get(currentWorkspaceMemberState.atom)?.id
      ) {
        return;
      }

      if (draftId !== threadId) {
        const draftMessagesAtom = agentChatMessagesFamilyState.atomFamily({
          threadId: draftId,
        });
        const canonicalMessagesAtom = agentChatMessagesFamilyState.atomFamily({
          threadId,
        });
        store.set(canonicalMessagesAtom, (messages) => [
          ...messages,
          ...store
            .get(draftMessagesAtom)
            .filter(({ id }) => !messages.some((message) => message.id === id)),
        ]);
        store.set(draftMessagesAtom, []);
        store.set(agentChatDraftsByThreadIdState.atom, (drafts) => ({
          ...drafts,
          [threadId]: mergeAgentChatDrafts({
            firstDraft: drafts[threadId] ?? '',
            secondDraft: drafts[draftId] ?? '',
          }),
          [draftId]: '',
        }));
        const draftFilesAtom =
          agentChatDirectMessageUploadedFilesFamilyState.atomFamily(draftId);
        store.set(
          agentChatDirectMessageUploadedFilesFamilyState.atomFamily(threadId),
          (files) => [...files, ...store.get(draftFilesAtom)],
        );
        store.set(draftFilesAtom, []);
        store.set(
          agentChatDirectMessageSelectedFilesFamilyState.atomFamily(threadId),
          (files) => [
            ...new Set([
              ...files,
              ...store.get(
                agentChatDirectMessageSelectedFilesFamilyState.atomFamily(
                  draftId,
                ),
              ),
            ]),
          ],
        );
      }

      store.set(agentChatDirectMessageDraftsState.atom, (drafts) => ({
        ...drafts,
        [draftId]: { ...draft, canonicalThreadId: threadId },
      }));

      if (draftId !== threadId) {
        store.set(
          agentChatDirectMessageSelectedFilesFamilyState.atomFamily(draftId),
          [],
        );
      }

      if (store.get(currentAiChatThreadState.atom) === draftId) {
        store.set(currentAiChatThreadState.atom, threadId);
        projectAiChatThreadToUrl(threadId);
      }
    },
    [store, loadAgentChatThread, projectAiChatThreadToUrl],
  );

  return { handoffDirectMessageDraft };
};
