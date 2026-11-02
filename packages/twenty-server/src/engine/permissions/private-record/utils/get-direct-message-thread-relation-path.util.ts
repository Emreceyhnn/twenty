import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

type ThreadRelation = {
  objectNameSingular: 'agentChatThread' | 'agentMessage';
  foreignKey: string;
  isNullable?: boolean;
};

const THREAD_RELATION: ThreadRelation = {
  objectNameSingular: 'agentChatThread',
  foreignKey: 'threadId',
};
const MESSAGE_RELATION: ThreadRelation = {
  objectNameSingular: 'agentMessage',
  foreignKey: 'messageId',
};
const RELATION_PATHS: Record<string, ThreadRelation[]> = {
  [STANDARD_OBJECTS.agentChatThread.universalIdentifier]: [],
  [STANDARD_OBJECTS.agentChatThreadParticipant.universalIdentifier]: [
    THREAD_RELATION,
  ],
  [STANDARD_OBJECTS.agentChatThreadTarget.universalIdentifier]: [
    THREAD_RELATION,
  ],
  [STANDARD_OBJECTS.agentMessage.universalIdentifier]: [THREAD_RELATION],
  [STANDARD_OBJECTS.agentTurn.universalIdentifier]: [THREAD_RELATION],
  [STANDARD_OBJECTS.agentMessagePart.universalIdentifier]: [
    MESSAGE_RELATION,
    THREAD_RELATION,
  ],
  [STANDARD_OBJECTS.agentMessageReaction.universalIdentifier]: [
    MESSAGE_RELATION,
    THREAD_RELATION,
  ],
  [STANDARD_OBJECTS.attachment.universalIdentifier]: [
    {
      objectNameSingular: 'agentChatThread',
      foreignKey: 'targetAgentChatThreadId',
      isNullable: true,
    },
  ],
};

export const getDirectMessageThreadRelationPath = (
  objectMetadata: Pick<FlatObjectMetadata, 'universalIdentifier'>,
): ThreadRelation[] | undefined =>
  RELATION_PATHS[objectMetadata.universalIdentifier];
