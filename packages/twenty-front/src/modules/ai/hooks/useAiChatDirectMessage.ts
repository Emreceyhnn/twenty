import { useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';

import { agentChatDirectMessageDraftFamilySelector } from '@/ai/states/selectors/agentChatDirectMessageDraftFamilySelector';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { agentChatThreadRecordFamilySelector } from '@/ai/states/selectors/agentChatThreadRecordFamilySelector';
import { getDirectMessagePeerId } from '@/ai/utils/getDirectMessagePeerId';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';
import { getAbsoluteImageUrl } from '~/utils/image/getAbsoluteImageUrl';

export const useAiChatDirectMessage = (threadId?: string | null) => {
  const { t } = useLingui();
  const currentAiChatThread = useAtomStateValue(currentAiChatThreadState);
  const selectedThreadId = threadId ?? currentAiChatThread;
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentWorkspaceMembers = useAtomStateValue(
    currentWorkspaceMembersState,
  );
  const draft = useAtomFamilySelectorValue(
    agentChatDirectMessageDraftFamilySelector,
    selectedThreadId ?? '',
  );
  const thread = useAtomFamilySelectorValue(
    agentChatThreadRecordFamilySelector,
    selectedThreadId ?? '',
  );
  const isCurrentDraft = isDefined(draft);
  const peerWorkspaceMemberId = isCurrentDraft
    ? (draft?.peerWorkspaceMemberId ?? null)
    : getDirectMessagePeerId({
        thread,
        currentWorkspaceMemberId: currentWorkspaceMember?.id,
      });
  const member = currentWorkspaceMembers.find(
    ({ id }) => id === peerWorkspaceMemberId,
  );

  return {
    isPendingDirectMessage:
      isCurrentDraft && !isDefined(draft?.canonicalThreadId),
    isDirectMessage: isDefined(peerWorkspaceMemberId),
    peerWorkspaceMemberId,
    peer: isDefined(peerWorkspaceMemberId)
      ? {
          workspaceMemberId: peerWorkspaceMemberId,
          name: isDefined(member)
            ? getWorkspaceMemberNameOrEmail(member)
            : t`Former member`,
          avatarUrl: getAbsoluteImageUrl(member?.avatarUrl),
          email: member?.userEmail,
        }
      : null,
  };
};
