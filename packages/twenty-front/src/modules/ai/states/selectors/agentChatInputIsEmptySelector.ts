import { agentChatDraftsByThreadIdState } from '@/ai/states/agentChatDraftsByThreadIdState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { createAtomSelector } from '@/ui/utilities/state/jotai/utils/createAtomSelector';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { agentChatDirectMessageDraftFamilySelector } from '@/ai/states/selectors/agentChatDirectMessageDraftFamilySelector';
import { agentChatDirectMessageUploadedFilesFamilyState } from '@/ai/states/agentChatDirectMessageUploadedFilesFamilyState';
import { agentChatUploadedFilesState } from '@/ai/states/agentChatUploadedFilesState';
import { agentChatThreadRecordFamilySelector } from '@/ai/states/selectors/agentChatThreadRecordFamilySelector';

// The editor stores an empty draft whenever its text is whitespace only
export const agentChatInputIsEmptySelector = createAtomSelector<boolean>({
  key: 'agentChatInputIsEmptySelector',
  get: ({ get }) => {
    const draftKey =
      get(currentAiChatThreadState) ?? get(newAiChatThreadIdState);

    const isDirectMessage =
      isDefined(get(agentChatDirectMessageDraftFamilySelector, draftKey)) ||
      get(agentChatThreadRecordFamilySelector, draftKey)?.conversationType ===
        'DIRECT_MESSAGE';
    const uploadedFiles = isDirectMessage
      ? get(agentChatDirectMessageUploadedFilesFamilyState, draftKey)
      : get(agentChatUploadedFilesState);

    return (
      !isNonEmptyString(get(agentChatDraftsByThreadIdState)[draftKey]) &&
      !isNonEmptyArray(uploadedFiles)
    );
  },
});
