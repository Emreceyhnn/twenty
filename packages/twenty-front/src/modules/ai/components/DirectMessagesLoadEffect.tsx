import { useEffect } from 'react';
import { useLoadDirectMessages } from '@/ai/hooks/useLoadDirectMessages';
import { agentChatThreadRecordUpdateCountState } from '@/ai/states/agentChatThreadRecordUpdateCountState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';

export const DirectMessagesLoadEffect = () => {
  const { loadDirectMessages } = useLoadDirectMessages();
  const agentChatThreadRecordUpdateCount = useAtomStateValue(
    agentChatThreadRecordUpdateCountState,
  );
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id;
  const workspaceMemberId = useAtomStateValue(currentWorkspaceMemberState)?.id;

  useEffect(() => {
    void loadDirectMessages('refresh');
  }, [
    loadDirectMessages,
    agentChatThreadRecordUpdateCount,
    workspaceId,
    workspaceMemberId,
  ]);

  return null;
};
