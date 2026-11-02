import { createStore, Provider, useStore } from 'jotai';
import { useState } from 'react';
import {
  isDefined,
  parseCanonicalTipTapJsonDocument,
} from 'twenty-shared/utils';
import { Button, Input } from 'twenty-ui/primitives/input';
import { Text } from 'twenty-ui/primitives/typography';

import { serializePlainTextAsAdvancedTextEditorDocument } from '@/advanced-text-editor/utils/serializePlainTextAsAdvancedTextEditorDocument';
import { DIRECT_MESSAGE_FLOW_FIXTURE } from '@/ai/components/__stories__/directMessageFlowFixture';
import { useAgentChatAttachments } from '@/ai/hooks/useAgentChatAttachments';
import { useAiChatDirectMessage } from '@/ai/hooks/useAiChatDirectMessage';
import { useHandoffDirectMessageDraft } from '@/ai/hooks/useHandoffDirectMessageDraft';
import { useOpenDirectMessage } from '@/ai/hooks/useOpenDirectMessage';
import { agentChatDirectMessageDraftsState } from '@/ai/states/agentChatDirectMessageDraftsState';
import { agentChatDirectMessageUploadedFilesFamilyState } from '@/ai/states/agentChatDirectMessageUploadedFilesFamilyState';
import { agentChatDraftsByThreadIdState } from '@/ai/states/agentChatDraftsByThreadIdState';
import { currentAiChatThreadState } from '@/ai/states/currentAiChatThreadState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import {
  mockedWorkspaceMemberData,
  mockCurrentWorkspace,
} from '~/testing/mock-data/users';

type DirectMessageFlowExampleProps = {
  onCanonicalSelection: (threadId: string | null) => void;
};

type DirectMessageFlowContentProps = DirectMessageFlowExampleProps;

const DirectMessageFlowContent = ({
  onCanonicalSelection,
}: DirectMessageFlowContentProps) => {
  const store = useStore();
  const { openDirectMessage, isOpening } = useOpenDirectMessage();
  const { handoffDirectMessageDraft } = useHandoffDirectMessageDraft();
  const { peer } = useAiChatDirectMessage();
  const currentAiChatThread = useAtomStateValue(currentAiChatThreadState);
  const [agentChatDraftsByThreadId, setAgentChatDraftsByThreadId] =
    useAtomState(agentChatDraftsByThreadIdState);
  const { uploadedFiles, setUploadedFiles, selectedFiles, setSelectedFiles } =
    useAgentChatAttachments();
  const draftDocument = parseCanonicalTipTapJsonDocument(
    agentChatDraftsByThreadId[currentAiChatThread ?? ''] ?? '',
  );
  const draftText =
    draftDocument?.content
      ?.map(({ content }) =>
        (content ?? [])
          .map(({ text, type }) => (type === 'hardBreak' ? '\n' : (text ?? '')))
          .join(''),
      )
      .join('\n') ?? '';

  return (
    <>
      <Button
        disabled={isOpening}
        onClick={() =>
          void openDirectMessage(DIRECT_MESSAGE_FLOW_FIXTURE.annaId)
        }
      >
        Open Anna
      </Button>
      <Button
        disabled={isOpening}
        onClick={() =>
          void openDirectMessage(DIRECT_MESSAGE_FLOW_FIXTURE.felixId)
        }
      >
        Open Felix
      </Button>
      <Text>{peer?.name ?? 'Choose a person'}</Text>
      <Input
        aria-label="Message draft"
        value={draftText}
        onChange={(event) => {
          if (isDefined(currentAiChatThread)) {
            setAgentChatDraftsByThreadId((previous) => ({
              ...previous,
              [currentAiChatThread]:
                serializePlainTextAsAdvancedTextEditorDocument(
                  event.target.value,
                ),
            }));
          }
        }}
      />
      <Button
        onClick={() =>
          setUploadedFiles([
            {
              type: 'file',
              fileId: DIRECT_MESSAGE_FLOW_FIXTURE.fileId,
              filename: 'notes.txt',
              mediaType: 'text/plain',
              url: '/notes.txt',
            },
          ])
        }
      >
        Attach notes
      </Button>
      {uploadedFiles.map(({ fileId, filename }) => (
        <Text key={fileId}>{filename}</Text>
      ))}
      <Button
        onClick={() =>
          setSelectedFiles([new File(['pending'], 'uploading.txt')])
        }
      >
        Start upload
      </Button>
      {selectedFiles.map((file) => (
        <Text key={file.name}>{file.name}</Text>
      ))}
      <Button
        onClick={async () => {
          if (!isDefined(currentAiChatThread)) {
            return;
          }
          await handoffDirectMessageDraft({
            draftId: currentAiChatThread,
            threadId: DIRECT_MESSAGE_FLOW_FIXTURE.canonicalThreadId,
          });
          onCanonicalSelection(store.get(currentAiChatThreadState.atom));
        }}
      >
        Open saved conversation
      </Button>
    </>
  );
};

export const DirectMessageFlowExample = ({
  onCanonicalSelection,
}: DirectMessageFlowExampleProps) => {
  const [store] = useState(() => {
    const initialStore = createStore();
    initialStore.set(currentWorkspaceState.atom, mockCurrentWorkspace);
    initialStore.set(
      currentWorkspaceMemberState.atom,
      mockedWorkspaceMemberData,
    );
    initialStore.set(currentAiChatThreadState.atom, null);
    initialStore.set(agentChatDirectMessageDraftsState.atom, {});
    initialStore.set(agentChatDraftsByThreadIdState.atom, {});
    initialStore.set(
      agentChatDirectMessageUploadedFilesFamilyState.atomFamily(
        DIRECT_MESSAGE_FLOW_FIXTURE.canonicalThreadId,
      ),
      [],
    );
    initialStore.set(currentWorkspaceMembersState.atom, [
      mockedWorkspaceMemberData,
      {
        ...mockedWorkspaceMemberData,
        id: DIRECT_MESSAGE_FLOW_FIXTURE.annaId,
        name: { firstName: 'Anna', lastName: '' },
      },
      {
        ...mockedWorkspaceMemberData,
        id: DIRECT_MESSAGE_FLOW_FIXTURE.felixId,
        name: { firstName: 'Felix', lastName: '' },
      },
    ]);
    initialStore.set(
      recordStoreFamilyState.atomFamily(
        DIRECT_MESSAGE_FLOW_FIXTURE.canonicalThreadId,
      ),
      {
        __typename: 'AgentChatThread',
        id: DIRECT_MESSAGE_FLOW_FIXTURE.canonicalThreadId,
        conversationType: 'DIRECT_MESSAGE',
        directMessageFirstWorkspaceMemberId: mockedWorkspaceMemberData.id,
        directMessageSecondWorkspaceMemberId:
          DIRECT_MESSAGE_FLOW_FIXTURE.annaId,
      },
    );
    return initialStore;
  });

  return (
    <Provider store={store}>
      <DirectMessageFlowContent onCanonicalSelection={onCanonicalSelection} />
    </Provider>
  );
};
