import { createAtomFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomFamilyState';

export const agentChatDirectMessageSendingFamilyState = createAtomFamilyState<
  boolean,
  string
>({
  key: 'ai/agentChatDirectMessageSendingFamilyState',
  defaultValue: false,
});
