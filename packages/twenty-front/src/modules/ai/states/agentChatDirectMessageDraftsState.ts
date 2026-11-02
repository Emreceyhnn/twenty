import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { type AgentChatDirectMessageDraft } from '@/ai/types/AgentChatDirectMessageDraft';

export const agentChatDirectMessageDraftsState = createAtomState<
  Record<string, AgentChatDirectMessageDraft>
>({
  key: 'ai/agentChatDirectMessageDraftsState',
  defaultValue: {},
  useSessionStorage: true,
});
