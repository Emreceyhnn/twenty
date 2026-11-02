import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { agentChatDirectMessageDraftFamilySelector } from '@/ai/states/selectors/agentChatDirectMessageDraftFamilySelector';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { agentChatThreadRecordFamilySelector } from '@/ai/states/selectors/agentChatThreadRecordFamilySelector';
import { getAgentChatAttachmentAtoms } from '@/ai/utils/getAgentChatAttachmentAtoms';
import { useDirectFileUpload } from '@/file/hooks/useDirectFileUpload';
import { useLingui } from '@lingui/react/macro';
import { useStore } from 'jotai';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { type AgentChatFileUIPart } from '@/ai/types/AgentChatFileUIPart';
import { FileFolder } from '~/generated-metadata/graphql';

export const useAiChatFileUpload = () => {
  const { uploadFile: directUploadFile } = useDirectFileUpload();
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const store = useStore();

  const uploadFiles = async (files: File[]) => {
    const threadId =
      store.get(currentAiChatThreadState.atom) ??
      store.get(newAiChatThreadIdState.atom);
    const draft = store.get(
      agentChatDirectMessageDraftFamilySelector.selectorFamily(threadId),
    );
    const thread = store.get(
      agentChatThreadRecordFamilySelector.selectorFamily(threadId),
    );
    const isDirectMessage =
      isDefined(draft) || thread?.conversationType === 'DIRECT_MESSAGE';
    const getAttachmentAtoms = () =>
      getAgentChatAttachmentAtoms({
        threadId:
          store.get(agentChatDirectMessageDraftsState.atom)[threadId]
            ?.canonicalThreadId ?? threadId,
        isDirectMessage,
      });

    const sendFile = async (
      file: File,
    ): Promise<AgentChatFileUIPart | null> => {
      const abortController = new AbortController();
      const subscribeToSelectedFiles = () =>
        store.sub(getAttachmentAtoms().selectedFilesAtom, () => {
          if (
            !store.get(getAttachmentAtoms().selectedFilesAtom).includes(file)
          ) {
            abortController.abort();
          }
        });
      let unsubscribeFromSelectedFiles = subscribeToSelectedFiles();
      const unsubscribeFromDrafts = store.sub(
        agentChatDirectMessageDraftsState.atom,
        () => {
          unsubscribeFromSelectedFiles();
          unsubscribeFromSelectedFiles = subscribeToSelectedFiles();
        },
      );

      try {
        const uploadedFile = await directUploadFile(file, {
          fileFolder: FileFolder.AgentChat,
          signal: abortController.signal,
        });

        if (!store.get(getAttachmentAtoms().selectedFilesAtom).includes(file)) {
          return null;
        }

        return {
          filename: file.name,
          mediaType: file.type,
          url: uploadedFile.url,
          fileId: uploadedFile.id,
          type: 'file',
        };
      } catch {
        const fileName = file.name;

        if (!abortController.signal.aborted) {
          enqueueToast({
            status: 'error',
            children: t`Failed to upload file: ${fileName}`,
          });
        }

        return null;
      } finally {
        unsubscribeFromSelectedFiles();
        unsubscribeFromDrafts();
        store.set(
          getAttachmentAtoms().selectedFilesAtom,
          (previousSelectedFiles) =>
            previousSelectedFiles.filter(
              (selectedFile) => selectedFile !== file,
            ),
        );
      }
    };

    store.set(
      getAttachmentAtoms().selectedFilesAtom,
      (previousSelectedFiles) => [...previousSelectedFiles, ...files],
    );

    const successfulUploads = (await Promise.all(files.map(sendFile))).filter(
      isDefined,
    );

    if (isNonEmptyArray(successfulUploads)) {
      store.set(
        getAttachmentAtoms().uploadedFilesAtom,
        (previousUploadedFiles) => [
          ...previousUploadedFiles,
          ...successfulUploads,
        ],
      );
    }

    return successfulUploads;
  };

  return { uploadFiles };
};
