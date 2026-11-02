import { type AgentChatThreadList } from '@/ai/states/agentChatThreadListState';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const agentChatDirectMessageListState = createAtomState<
  | (AgentChatThreadList & {
      workspaceId: string;
      workspaceMemberId: string;
    })
  | null
>({
  key: 'ai/agentChatDirectMessageListState',
  defaultValue: null,
});
