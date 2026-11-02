import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { useAiChatDirectMessage } from '@/ai/hooks/useAiChatDirectMessage';
import { newAiChatThreadIdState } from '@/ai/states/newAiChatThreadIdState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useIsOnNewAiChatSlot = () => {
  const currentAiChatThread = useAtomStateValue(currentAiChatThreadState);
  const newAiChatThreadId = useAtomStateValue(newAiChatThreadIdState);
  const { isPendingDirectMessage } = useAiChatDirectMessage();

  return currentAiChatThread === newAiChatThreadId || isPendingDirectMessage;
};
