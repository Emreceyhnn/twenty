import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

export const agentChatDirectMessageSelectedFilesFamilyState =
  createAtomFamilyState<File[], string>({
    key: 'ai/agentChatDirectMessageSelectedFilesFamilyState',
    defaultValue: [],
  });
