import { useStore } from 'jotai';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { FeatureFlagKey } from '~/generated-metadata/graphql';

import { useAddAgentChatThreadParticipants } from '@/ai/hooks/useAddAgentChatThreadParticipants';
import { useFetchAgentChatThreadsPage } from '@/ai/hooks/useFetchAgentChatThreadsPage';
import { useRefreshAgentChatThreadPermissions } from '@/ai/hooks/useRefreshAgentChatThreadPermissions';
import { agentChatDirectMessageListLoadingState } from '@/ai/states/agentChatDirectMessageListLoadingState';
import { agentChatDirectMessageListState } from '@/ai/states/agentChatDirectMessageListState';
import { agentChatThreadRecordUpdateCountState } from '@/ai/states/agentChatThreadRecordUpdateCountState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';

export const useLoadDirectMessages = () => {
  const store = useStore();
  const { fetchAgentChatThreadsPage } = useFetchAgentChatThreadsPage();
  const { upsertRecordsInStore } = useUpsertRecordsInStore();
  const { addAgentChatThreadParticipants } =
    useAddAgentChatThreadParticipants();
  const { refreshAgentChatThreadPermissions } =
    useRefreshAgentChatThreadPermissions();

  const loadDirectMessages = useCallback(
    async (mode: 'refresh' | 'fetch-more') => {
      const workspaceId = store.get(currentWorkspaceState.atom)?.id;
      const memberId = store.get(currentWorkspaceMemberState.atom)?.id;
      const loadingRequest = store.get(
        agentChatDirectMessageListLoadingState.atom,
      );
      const isEnabled =
        store
          .get(currentWorkspaceState.atom)
          ?.featureFlags?.some(
            ({ key, value }) =>
              key ===
                FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED &&
              value,
          ) ?? false;

      if (
        !isEnabled ||
        !isDefined(workspaceId) ||
        !isDefined(memberId) ||
        (loadingRequest?.workspaceId === workspaceId &&
          loadingRequest.workspaceMemberId === memberId)
      ) {
        return;
      }
      const userWorkspace = store.get(currentUserWorkspaceState.atom);
      const isSameSession = () =>
        store.get(currentWorkspaceState.atom)?.id === workspaceId &&
        store.get(currentWorkspaceMemberState.atom)?.id === memberId &&
        store.get(currentUserWorkspaceState.atom) === userWorkspace;
      const loadedList = store.get(agentChatDirectMessageListState.atom);
      const previousList =
        loadedList?.workspaceId === workspaceId &&
        loadedList.workspaceMemberId === memberId
          ? loadedList
          : null;

      if (mode === 'fetch-more' && !previousList?.hasNextPage) {
        return;
      }

      const requestId = v4();
      store.set(agentChatDirectMessageListLoadingState.atom, {
        workspaceId,
        workspaceMemberId: memberId,
        requestId,
      });

      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const updateCount = store.get(
            agentChatThreadRecordUpdateCountState.atom,
          );
          let cursor =
            mode === 'fetch-more' ? (previousList?.endCursor ?? null) : null;
          const pages = [];
          let loadedCount = 0;

          do {
            const page = await fetchAgentChatThreadsPage({
              lastCursor: cursor,
              threadIdFilter: {
                and: [
                  { conversationType: { eq: 'DIRECT_MESSAGE' } },
                  { deletedAt: { is: 'NULL' } },
                  { lastActivityAt: { is: 'NOT_NULL' } },
                ],
              },
            });

            if (!isDefined(page) || !isSameSession()) {
              return;
            }

            pages.push(page);
            loadedCount += page.threads.length;
            cursor = page.hasNextPage ? page.endCursor : null;
          } while (
            mode === 'refresh' &&
            isDefined(cursor) &&
            loadedCount < (previousList?.threadIds.length ?? 0)
          );

          const threads = pages.flatMap(({ threads }) => threads);
          await refreshAgentChatThreadPermissions(threads.map(({ id }) => id));

          if (!isSameSession()) {
            return;
          }

          if (
            store.get(agentChatThreadRecordUpdateCountState.atom) !==
            updateCount
          ) {
            continue;
          }

          upsertRecordsInStore({ partialRecords: threads });
          addAgentChatThreadParticipants(
            pages.flatMap(({ participants }) => participants),
          );
          const lastPage = pages.at(-1);
          store.set(agentChatDirectMessageListState.atom, {
            workspaceId,
            workspaceMemberId: memberId,
            threadIds: [
              ...new Set([
                ...(mode === 'fetch-more'
                  ? (previousList?.threadIds ?? [])
                  : []),
                ...threads.map(({ id }) => id),
              ]),
            ],
            hasNextPage: lastPage?.hasNextPage ?? false,
            endCursor: lastPage?.endCursor ?? null,
          });
          return;
        }
      } catch {
        return;
      } finally {
        if (
          store.get(agentChatDirectMessageListLoadingState.atom)?.requestId ===
          requestId
        ) {
          store.set(agentChatDirectMessageListLoadingState.atom, null);
        }
      }
    },
    [
      store,
      fetchAgentChatThreadsPage,
      refreshAgentChatThreadPermissions,
      upsertRecordsInStore,
      addAgentChatThreadParticipants,
    ],
  );

  return { loadDirectMessages };
};
