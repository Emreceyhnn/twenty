import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const agentChatDirectMessageListLoadingState = createAtomState<{
  workspaceId: string;
  workspaceMemberId: string;
  requestId: string;
} | null>({
  key: 'ai/agentChatDirectMessageListLoadingState',
  defaultValue: null,
});
