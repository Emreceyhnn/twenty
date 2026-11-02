import { useAtom } from 'jotai';
import { useAiChatDirectMessage } from '@/ai/hooks/useAiChatDirectMessage';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { getAgentChatAttachmentAtoms } from '@/ai/utils/getAgentChatAttachmentAtoms';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useAgentChatAttachments = () => {
  const currentThreadId = useAtomStateValue(currentAiChatThreadState);
  const newThreadId = useAtomStateValue(newAiChatThreadIdState);
  const { isDirectMessage } = useAiChatDirectMessage();
  const { selectedFilesAtom, uploadedFilesAtom } = getAgentChatAttachmentAtoms({
    threadId: currentThreadId ?? newThreadId,
    isDirectMessage,
  });
  const [selectedFiles, setSelectedFiles] = useAtom(selectedFilesAtom);
  const [uploadedFiles, setUploadedFiles] = useAtom(uploadedFilesAtom);

  return {
    selectedFiles,
    setSelectedFiles,
    uploadedFiles,
    setUploadedFiles,
    selectedFilesAtom,
    uploadedFilesAtom,
  };
};
