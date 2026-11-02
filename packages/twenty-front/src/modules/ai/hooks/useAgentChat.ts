import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useApolloClient } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { type ExtendedUIMessage } from 'twenty-shared/ai';
import {
  isDefined,
  isNonEmptyArray,
  tipTapDocumentToMarkdown,
} from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { v4 } from 'uuid';

import { AGENT_CHAT_REFETCH_MESSAGES_EVENT_NAME } from '@/ai/constants/AgentChatRefetchMessagesEventName';
import { AGENT_CHAT_RESTORE_EDITOR_CONTENT_EVENT_NAME } from '@/ai/constants/AgentChatRestoreEditorContentEventName';
import { AGENT_CHAT_SEND_MESSAGE_EVENT_NAME } from '@/ai/constants/AgentChatSendMessageEventName';
import { AGENT_CHAT_STOP_EVENT_NAME } from '@/ai/constants/AgentChatStopEventName';
import { useAgentChatModelId } from '@/ai/hooks/useAgentChatModelId';
import { useAttachChatThreadToRecord } from '@/ai/hooks/useAttachChatThreadToRecord';
import { useCanSendAgentChatMessage } from '@/ai/hooks/useCanSendAgentChatMessage';
import { useGetBrowsingContext } from '@/ai/hooks/useGetBrowsingContext';
import { useOptimisticallyRestoreOnSend } from '@/ai/hooks/useOptimisticallyRestoreOnSend';
import { useProjectAiChatThreadToUrl } from '@/ai/hooks/useProjectAiChatThreadToUrl';
import { useRefreshAgentChatThreadPermissions } from '@/ai/hooks/useRefreshAgentChatThreadPermissions';
import { useWarnAboutParticipantMentionsNotAdded } from '@/ai/hooks/useWarnAboutParticipantMentionsNotAdded';
import { agentChatDraftsByThreadIdState } from '@/ai/states/agentChatDraftsByThreadIdState';
import { agentChatLastSentBrowsingContextFamilyState } from '@/ai/states/agentChatLastSentBrowsingContextFamilyState';
import { agentChatSentMessageHandOffState } from '@/ai/states/agentChatSentMessageHandOffState';
import { agentChatDirectMessageDraftFamilySelector } from '@/ai/states/selectors/agentChatDirectMessageDraftFamilySelector';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { agentChatDirectMessageSendingFamilyState } from '@/ai/states/agentChatDirectMessageSendingFamilyState';
import { agentChatThreadRecordFamilySelector } from '@/ai/states/selectors/agentChatThreadRecordFamilySelector';
import { getAgentChatAttachmentAtoms } from '@/ai/utils/getAgentChatAttachmentAtoms';
import { getDirectMessagePeerId } from '@/ai/utils/getDirectMessagePeerId';
import { mergeAgentChatDrafts } from '@/ai/utils/mergeAgentChatDrafts';
import { useHandoffDirectMessageDraft } from '@/ai/hooks/useHandoffDirectMessageDraft';
import { useLoadDirectMessages } from '@/ai/hooks/useLoadDirectMessages';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { agentChatErrorFamilyState } from '@/ai/states/agentChatErrorFamilyState';
import { agentChatIsAwaitingFirstChunkFamilyState } from '@/ai/states/agentChatIsAwaitingFirstChunkFamilyState';
import { agentChatIsAssistantOffState } from '@/ai/states/agentChatIsAssistantOffState';
import { agentChatMessagesFamilyState } from '@/ai/states/agentChatMessagesFamilyState';
import { agentChatNewThreadChannelIdState } from '@/ai/states/agentChatNewThreadChannelIdState';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { getConversationTargetsFromSerializedDocument } from '@/ai/utils/getConversationTargetsFromSerializedDocument';
import { getParticipantMentionsFromSerializedDocument } from '@/ai/utils/getParticipantMentionsFromSerializedDocument';
import { isAgentChatAssistantMentionedInSerializedDocument } from '@/ai/utils/isAgentChatAssistantMentionedInSerializedDocument';
import { isAiChatCreditsExhaustedError } from '@/ai/utils/isAiChatCreditsExhaustedError';
import { toAiChatError } from '@/ai/utils/toAiChatError';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useListenToBrowserEvent } from '@/browser-event/hooks/useListenToBrowserEvent';
import { dispatchBrowserEvent } from '@/browser-event/utils/dispatchBrowserEvent';
import { aiModelsState } from '@/client-config/states/aiModelsState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import {
  markWorkspaceCreditsAvailable,
  markWorkspaceCreditsExhausted,
} from '@/workspace/utils/updateWorkspaceResourceCreditCap';
import {
  SendChatMessageDocument,
  StopAgentChatStreamDocument,
} from '~/generated-metadata/graphql';

export const useAgentChat = () => {
  const { modelIdForRequest } = useAgentChatModelId();
  const aiModels = useAtomStateValue(aiModelsState);
  const canSendAgentChatMessage = useCanSendAgentChatMessage();
  const { getBrowsingContext } = useGetBrowsingContext();
  const { applyOptimisticRestore } = useOptimisticallyRestoreOnSend();
  const { attachChatThreadToRecord } = useAttachChatThreadToRecord();
  const { warnAboutParticipantMentionsNotAdded } =
    useWarnAboutParticipantMentionsNotAdded();
  const apolloClient = useApolloClient();
  const { enqueueToast } = useToast();
  const setCurrentAiChatThread = useSetAtomState(currentAiChatThreadState);
  const { projectAiChatThreadToUrl } = useProjectAiChatThreadToUrl({
    shouldPreserveClosedInbox: true,
  });
  const { refreshAgentChatThreadPermissions } =
    useRefreshAgentChatThreadPermissions();
  const store = useStore();
  const { handoffDirectMessageDraft } = useHandoffDirectMessageDraft();
  const { loadDirectMessages } = useLoadDirectMessages();

  const setAgentChatDraftsByThreadId = useSetAtomState(
    agentChatDraftsByThreadIdState,
  );

  const handleSendMessage = useCallback(async () => {
    const newAiChatThreadId = store.get(newAiChatThreadIdState.atom);
    const threadId =
      store.get(currentAiChatThreadState.atom) ?? newAiChatThreadId;
    const directMessageDraft = store.get(
      agentChatDirectMessageDraftFamilySelector.selectorFamily(threadId),
    );
    const isPendingDirectMessage =
      isDefined(directMessageDraft) &&
      !isDefined(directMessageDraft.canonicalThreadId);
    const directMessagePeerId =
      directMessageDraft?.peerWorkspaceMemberId ??
      getDirectMessagePeerId({
        thread: store.get(
          agentChatThreadRecordFamilySelector.selectorFamily(threadId),
        ),
        currentWorkspaceMemberId: store.get(currentWorkspaceMemberState.atom)
          ?.id,
      });
    const isDirectMessage = isDefined(directMessagePeerId);
    const sendingWorkspaceId = store.get(currentWorkspaceState.atom)?.id;
    const sendingWorkspaceMemberId = store.get(
      currentWorkspaceMemberState.atom,
    )?.id;
    const sendingUserWorkspace = store.get(currentUserWorkspaceState.atom);
    const isSameSendSession = () =>
      store.get(currentWorkspaceState.atom)?.id === sendingWorkspaceId &&
      store.get(currentWorkspaceMemberState.atom)?.id ===
        sendingWorkspaceMemberId &&
      store.get(currentUserWorkspaceState.atom) === sendingUserWorkspace;
    const sendingAtom =
      agentChatDirectMessageSendingFamilyState.atomFamily(threadId);

    if (isPendingDirectMessage && store.get(sendingAtom)) {
      return;
    }

    const { selectedFilesAtom, uploadedFilesAtom } =
      getAgentChatAttachmentAtoms({ threadId, isDirectMessage });
    const isNewChat = threadId === newAiChatThreadId || isPendingDirectMessage;
    const serializedContentToSend =
      store.get(agentChatDraftsByThreadIdState.atom)[threadId] ?? '';
    const contentToSend = tipTapDocumentToMarkdown(
      serializedContentToSend,
    ).trim();

    const agentChatUploadedFiles = store.get(uploadedFilesAtom);

    if (contentToSend === '' && !isNonEmptyArray(agentChatUploadedFiles)) {
      return;
    }

    if (!canSendAgentChatMessage) {
      enqueueToast({
        status: 'error',
        children: t`No AI provider is configured on this instance.`,
      });

      return;
    }

    const agentChatSelectedFiles = store.get(selectedFilesAtom);

    if (isNonEmptyArray(agentChatSelectedFiles)) {
      enqueueToast({
        status: 'error',
        children: t`Wait for the attachments to finish uploading.`,
      });

      return;
    }

    // Selects the new chat when the composer wrote to it before the chat list loaded
    setCurrentAiChatThread(threadId);

    setAgentChatDraftsByThreadId((prev) => ({
      ...prev,
      [threadId]: '',
    }));

    dispatchBrowserEvent(AGENT_CHAT_RESTORE_EDITOR_CONTENT_EVENT_NAME, {
      content: '',
    });

    const browsingContext = getBrowsingContext();
    let lastSentBrowsingContextAtom =
      agentChatLastSentBrowsingContextFamilyState.atomFamily(threadId);
    const lastSentBrowsingContext = store.get(lastSentBrowsingContextAtom);
    const isBrowsingContextChanged =
      lastSentBrowsingContext === undefined
        ? browsingContext !== null
        : JSON.stringify(browsingContext) !==
          JSON.stringify(lastSentBrowsingContext);
    const browsingContextToSend = isBrowsingContextChanged
      ? browsingContext
      : null;
    const messageId = v4();
    const optimisticMessageCreatedAt = new Date().toISOString();
    const hasSavedDirectMessage = isDefined(
      store.get(agentChatThreadRecordFamilySelector.selectorFamily(threadId))
        ?.lastActivityAt,
    );
    const rollbackOptimisticRestore =
      isDirectMessage && !hasSavedDirectMessage
        ? () => {}
        : applyOptimisticRestore({
            threadId,
            optimisticUpdatedAt: optimisticMessageCreatedAt,
          });

    const optimisticUserMessage: ExtendedUIMessage = {
      id: messageId,
      role: 'user',
      parts: [
        { type: 'text' as const, text: contentToSend },
        ...agentChatUploadedFiles,
      ],
      metadata: {
        createdAt: optimisticMessageCreatedAt,
        senderWorkspaceMemberId: store.get(currentWorkspaceMemberState.atom)
          ?.id,
      },
      status: 'sent',
    };

    let messagesAtom = agentChatMessagesFamilyState.atomFamily({ threadId });
    let errorAtom = agentChatErrorFamilyState.atomFamily({ threadId });
    let isAwaitingFirstChunkAtom =
      agentChatIsAwaitingFirstChunkFamilyState.atomFamily({ threadId });
    const removeOptimisticUserMessage = () => {
      store.set(messagesAtom, (messages) =>
        messages.filter((message) => message.id !== messageId),
      );
      store.set(isAwaitingFirstChunkAtom, false);
    };

    store.set(agentChatSentMessageHandOffState.atom, (sentMessageHandOff) =>
      isDefined(sentMessageHandOff)
        ? { ...sentMessageHandOff, messageId }
        : null,
    );
    store.set(messagesAtom, (messages) => [...messages, optimisticUserMessage]);
    store.set(errorAtom, null);
    store.set(isAwaitingFirstChunkAtom, true);

    const fileAttachments = agentChatUploadedFiles.map((file) => ({
      id: file.fileId,
      filename: file.filename,
    }));

    // Members already following are sent too, so the mention brings the chat
    // back to their inbox
    const currentWorkspaceMemberId = store.get(
      currentWorkspaceMemberState.atom,
    )?.id;
    const participantMentions = getParticipantMentionsFromSerializedDocument(
      serializedContentToSend,
    ).filter(
      ({ workspaceMemberId }) => workspaceMemberId !== currentWorkspaceMemberId,
    );

    store.set(uploadedFilesAtom, []);
    if (isPendingDirectMessage) {
      store.set(sendingAtom, true);
    }

    try {
      const { data } = await apolloClient.mutate({
        mutation: SendChatMessageDocument,
        variables: {
          threadId,
          directMessageWorkspaceMemberId: isPendingDirectMessage
            ? directMessagePeerId
            : undefined,
          isAssistantMentioned:
            isAgentChatAssistantMentionedInSerializedDocument(
              serializedContentToSend,
            ),
          text: contentToSend,
          messageId,
          browsingContext: browsingContextToSend,
          modelId: modelIdForRequest,
          fileAttachments: isNonEmptyArray(fileAttachments)
            ? fileAttachments
            : undefined,
          mentionedWorkspaceMemberIds: isNonEmptyArray(participantMentions)
            ? participantMentions.map(
                ({ workspaceMemberId }) => workspaceMemberId,
              )
            : undefined,
          channelId:
            isNewChat && !isDirectMessage
              ? (store.get(agentChatNewThreadChannelIdState.atom) ?? undefined)
              : undefined,
          shouldAssistantReply: isDirectMessage
            ? undefined
            : aiModels.length > 0 &&
              (!store.get(agentChatIsAssistantOffState.atom) ||
                isAgentChatAssistantMentionedInSerializedDocument(
                  serializedContentToSend,
                )),
        },
      });

      const canonicalThreadId = data?.sendChatMessage.threadId ?? threadId;

      if (isDirectMessage && !isSameSendSession()) {
        return;
      }

      if (isPendingDirectMessage) {
        await handoffDirectMessageDraft({
          draftId: threadId,
          threadId: canonicalThreadId,
        });
        if (!isSameSendSession()) {
          return;
        }
        store.set(isAwaitingFirstChunkAtom, false);
        messagesAtom = agentChatMessagesFamilyState.atomFamily({
          threadId: canonicalThreadId,
        });
        errorAtom = agentChatErrorFamilyState.atomFamily({
          threadId: canonicalThreadId,
        });
        isAwaitingFirstChunkAtom =
          agentChatIsAwaitingFirstChunkFamilyState.atomFamily({
            threadId: canonicalThreadId,
          });
        lastSentBrowsingContextAtom =
          agentChatLastSentBrowsingContextFamilyState.atomFamily(
            canonicalThreadId,
          );
        void loadDirectMessages('refresh');
      }

      const isAssistantReplying =
        data?.sendChatMessage.queued === true ||
        isDefined(data?.sendChatMessage.streamId);

      store.set(isAwaitingFirstChunkAtom, isAssistantReplying);

      if (isAssistantReplying) {
        // The stream may already have set a newer credits-exhausted error; don't clear it.
        if (!isAiChatCreditsExhaustedError(store.get(errorAtom))) {
          store.set(currentWorkspaceState.atom, markWorkspaceCreditsAvailable);
        }

        // Only a turn reads the context, so a later turn still needs it otherwise
        if (isBrowsingContextChanged) {
          store.set(lastSentBrowsingContextAtom, browsingContext);
        }
      } else {
        store.set(isAwaitingFirstChunkAtom, false);
      }

      // Filed after the send: a failed send restores the draft, so the retry files it.
      for (const conversationTarget of getConversationTargetsFromSerializedDocument(
        serializedContentToSend,
      )) {
        void attachChatThreadToRecord({
          threadId: canonicalThreadId,
          ...conversationTarget,
        });
      }
      warnAboutParticipantMentionsNotAdded({
        participantMentions,
        addedWorkspaceMemberIds:
          data?.sendChatMessage.mentionedParticipantWorkspaceMemberIds ?? [],
      });

      if (data?.sendChatMessage.queued === true) {
        removeOptimisticUserMessage();
      }

      // The send created the thread. Its permissions load before it stops
      // being the new chat, so its composer never shows as loading.
      if (isNewChat && !isPendingDirectMessage) {
        await refreshAgentChatThreadPermissions([threadId]);
        store.set(newAiChatThreadIdState.atom, v4());
        store.set(agentChatNewThreadChannelIdState.atom, null);

        if (store.get(currentAiChatThreadState.atom) === threadId) {
          projectAiChatThreadToUrl(threadId);
        }
      }

      dispatchBrowserEvent(AGENT_CHAT_REFETCH_MESSAGES_EVENT_NAME);
    } catch (error) {
      if (isDirectMessage && !isSameSendSession()) {
        return;
      }
      rollbackOptimisticRestore();

      const restoredThreadId =
        store.get(agentChatDirectMessageDraftsState.atom)[threadId]
          ?.canonicalThreadId ?? threadId;
      messagesAtom = agentChatMessagesFamilyState.atomFamily({
        threadId: restoredThreadId,
      });
      errorAtom = agentChatErrorFamilyState.atomFamily({
        threadId: restoredThreadId,
      });
      isAwaitingFirstChunkAtom =
        agentChatIsAwaitingFirstChunkFamilyState.atomFamily({
          threadId: restoredThreadId,
        });
      const restoredUploadedFilesAtom = getAgentChatAttachmentAtoms({
        threadId: restoredThreadId,
        isDirectMessage,
      }).uploadedFilesAtom;

      setAgentChatDraftsByThreadId((prev) => ({
        ...prev,
        [restoredThreadId]: mergeAgentChatDrafts({
          firstDraft: serializedContentToSend,
          secondDraft: prev[restoredThreadId] ?? '',
        }),
      }));
      store.set(restoredUploadedFilesAtom, (currentUploadedFiles) => [
        ...agentChatUploadedFiles,
        ...currentUploadedFiles,
      ]);

      removeOptimisticUserMessage();
      store.set(errorAtom, toAiChatError(error));

      if (isAiChatCreditsExhaustedError(error)) {
        store.set(currentWorkspaceState.atom, markWorkspaceCreditsExhausted);
      }

      if (store.get(currentAiChatThreadState.atom) === restoredThreadId) {
        dispatchBrowserEvent(AGENT_CHAT_RESTORE_EDITOR_CONTENT_EVENT_NAME, {
          content:
            store.get(agentChatDraftsByThreadIdState.atom)[restoredThreadId] ??
            '',
        });
      }
    } finally {
      store.set(sendingAtom, false);
    }
  }, [
    store,
    getBrowsingContext,
    handoffDirectMessageDraft,
    loadDirectMessages,
    setAgentChatDraftsByThreadId,
    modelIdForRequest,
    aiModels,
    canSendAgentChatMessage,
    enqueueToast,
    setCurrentAiChatThread,
    projectAiChatThreadToUrl,
    refreshAgentChatThreadPermissions,
    apolloClient,
    applyOptimisticRestore,
    attachChatThreadToRecord,
    warnAboutParticipantMentionsNotAdded,
  ]);

  useListenToBrowserEvent({
    eventName: AGENT_CHAT_SEND_MESSAGE_EVENT_NAME,
    onBrowserEvent: handleSendMessage,
  });

  const handleStop = useCallback(async () => {
    const threadId = store.get(currentAiChatThreadState.atom);

    if (!isDefined(threadId)) {
      return;
    }

    store.set(
      agentChatIsAwaitingFirstChunkFamilyState.atomFamily({ threadId }),
      false,
    );

    try {
      await apolloClient.mutate({
        mutation: StopAgentChatStreamDocument,
        variables: { threadId },
      });
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  }, [store, apolloClient, enqueueToast]);

  useListenToBrowserEvent({
    eventName: AGENT_CHAT_STOP_EVENT_NAME,
    onBrowserEvent: handleStop,
  });

  return {
    handleSendMessage,
    handleStop,
  };
};
