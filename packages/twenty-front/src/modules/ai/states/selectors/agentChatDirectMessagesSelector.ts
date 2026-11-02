import { agentChatDirectMessageListState } from '@/ai/states/agentChatDirectMessageListState';
import { agentChatThreadListState } from '@/ai/states/agentChatThreadListState';
import { agentChatThreadRecordFamilySelector } from '@/ai/states/selectors/agentChatThreadRecordFamilySelector';
import { type AgentChatThreadRecord } from '@/ai/types/AgentChatThreadRecord';
import { isSavedDirectMessage } from '@/ai/utils/isSavedDirectMessage';
import { sortChatThreadsByLastActivityDesc } from '@/ai/utils/sortChatThreadsByLastActivityDesc';
import { createAtomSelector } from '@/ui/utilities/state/jotai/utils/createAtomSelector';
import { isDefined } from 'twenty-shared/utils';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';

export const agentChatDirectMessagesSelector = createAtomSelector<
  AgentChatThreadRecord[]
>({
  key: 'agentChatDirectMessagesSelector',
  get: ({ get }) => {
    const list = get(agentChatDirectMessageListState);
    const isCurrentList =
      list?.workspaceId === get(currentWorkspaceState)?.id &&
      list?.workspaceMemberId === get(currentWorkspaceMemberState)?.id;

    return sortChatThreadsByLastActivityDesc(
      [
        ...new Set([
          ...(isCurrentList ? (list?.threadIds ?? []) : []),
          ...(get(agentChatThreadListState)?.threadIds ?? []),
        ]),
      ]
        .map((id) => get(agentChatThreadRecordFamilySelector, id))
        .filter(isDefined)
        .filter(isSavedDirectMessage),
    );
  },
});
