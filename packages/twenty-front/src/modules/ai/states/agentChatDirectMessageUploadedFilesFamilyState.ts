import { type AgentChatFileUIPart } from '@/ai/types/AgentChatFileUIPart';
import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

export const agentChatDirectMessageUploadedFilesFamilyState =
  createAtomFamilyState<AgentChatFileUIPart[], string>({
    key: 'ai/agentChatDirectMessageUploadedFilesFamilyState',
    defaultValue: [],
    useLocalStorage: true,
  });
