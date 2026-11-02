import {
  CoreObjectNameSingular,
  type CommandMenuContextApi,
} from 'twenty-shared/types';
import { EngineComponentKey } from '~/generated-metadata/graphql';

const UNSUPPORTED_DIRECT_MESSAGE_COMMANDS = new Set<EngineComponentKey>([
  EngineComponentKey.SHARE_RECORD,
  EngineComponentKey.DELETE_RECORDS,
  EngineComponentKey.DESTROY_RECORDS,
  EngineComponentKey.RESTORE_RECORDS,
  EngineComponentKey.ASSIGN_AI_CHAT,
  EngineComponentKey.SUBSCRIBE_TO_AI_CHAT,
  EngineComponentKey.UNSUBSCRIBE_FROM_AI_CHAT,
  EngineComponentKey.ADD_TO_FAVORITES,
  EngineComponentKey.REMOVE_FROM_FAVORITES,
  EngineComponentKey.UPDATE_MULTIPLE_RECORDS,
]);

export const isCommandAllowedForDirectMessage = ({
  engineComponentKey,
  context,
}: {
  engineComponentKey: EngineComponentKey;
  context: Pick<
    CommandMenuContextApi,
    'objectMetadataItem' | 'selectedRecords'
  >;
}) => {
  const hasDirectMessageSelection =
    context.objectMetadataItem.nameSingular ===
      CoreObjectNameSingular.AgentChatThread &&
    context.selectedRecords.some(
      ({ conversationType }) => conversationType === 'DIRECT_MESSAGE',
    );

  return (
    !hasDirectMessageSelection ||
    !UNSUPPORTED_DIRECT_MESSAGE_COMMANDS.has(engineComponentKey)
  );
};
