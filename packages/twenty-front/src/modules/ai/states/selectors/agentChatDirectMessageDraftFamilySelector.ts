import { isDefined } from 'twenty-shared/utils';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { type AgentChatDirectMessageDraft } from '@/ai/types/AgentChatDirectMessageDraft';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { createAtomFamilySelector } from '@/ui/utilities/state/jotai/utils/createAtomFamilySelector';

export const agentChatDirectMessageDraftFamilySelector =
  createAtomFamilySelector<AgentChatDirectMessageDraft | null, string>({
    key: 'agentChatDirectMessageDraftFamilySelector',
    get:
      (threadId) =>
      ({ get }) => {
        const drafts = get(agentChatDirectMessageDraftsState);
        const draft =
          drafts[threadId] ??
          Object.values(drafts).find(
            ({ canonicalThreadId }) => canonicalThreadId === threadId,
          );

        return isDefined(draft) &&
          draft.workspaceId === get(currentWorkspaceState)?.id &&
          draft.workspaceMemberId === get(currentWorkspaceMemberState)?.id
          ? draft
          : null;
      },
  });
