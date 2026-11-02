import { useMemo } from 'react';
import { useAiChatDirectMessage } from '@/ai/hooks/useAiChatDirectMessage';

import { agentChatDraftsByThreadIdState } from '@/ai/states/agentChatDraftsByThreadIdState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { agentChatThreadRecordFamilySelector } from '@/ai/states/selectors/agentChatThreadRecordFamilySelector';
import { filterNewParticipantMentions } from '@/ai/utils/filterNewParticipantMentions';
import { getParticipantMentionsFromSerializedDocument } from '@/ai/utils/getParticipantMentionsFromSerializedDocument';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useAiChatPendingParticipantMentions = () => {
  const currentAiChatThread = useAtomStateValue(currentAiChatThreadState);
  const newAiChatThreadId = useAtomStateValue(newAiChatThreadIdState);
  const draftKey = currentAiChatThread ?? newAiChatThreadId;
  const serializedDraft =
    useAtomStateValue(agentChatDraftsByThreadIdState)[draftKey] ?? '';
  const thread = useAtomFamilySelectorValue(
    agentChatThreadRecordFamilySelector,
    draftKey,
  );
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { isDirectMessage } = useAiChatDirectMessage();

  const participantMentions = useMemo(
    () => getParticipantMentionsFromSerializedDocument(serializedDraft),
    [serializedDraft],
  );

  return isDirectMessage
    ? []
    : filterNewParticipantMentions({
        participantMentions,
        thread,
        currentWorkspaceMemberId: currentWorkspaceMember?.id,
      });
};
