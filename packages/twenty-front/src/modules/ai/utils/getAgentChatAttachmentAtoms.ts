import { agentChatDirectMessageSelectedFilesFamilyState } from '@/ai/states/agentChatDirectMessageSelectedFilesFamilyState';
import { agentChatDirectMessageUploadedFilesFamilyState } from '@/ai/states/agentChatDirectMessageUploadedFilesFamilyState';
import { agentChatSelectedFilesState } from '@/ai/states/agentChatSelectedFilesState';
import { agentChatUploadedFilesState } from '@/ai/states/agentChatUploadedFilesState';

export const getAgentChatAttachmentAtoms = ({
  threadId,
  isDirectMessage,
}: {
  threadId: string;
  isDirectMessage: boolean;
}) => ({
  selectedFilesAtom: isDirectMessage
    ? agentChatDirectMessageSelectedFilesFamilyState.atomFamily(threadId)
    : agentChatSelectedFilesState.atom,
  uploadedFilesAtom: isDirectMessage
    ? agentChatDirectMessageUploadedFilesFamilyState.atomFamily(threadId)
    : agentChatUploadedFilesState.atom,
});
