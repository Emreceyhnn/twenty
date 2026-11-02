import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type PermissionsRowAccessRequest } from 'src/engine/permissions/combine/types/row-access-policy.type';
import { type DirectMessagePermissionObject } from 'src/engine/permissions/direct-message/types/direct-message-permission-object.type';

const DIRECT_MESSAGE_PERMISSION_OBJECTS: DirectMessagePermissionObject[] = [
  'agentChatThread',
  'agentChatThreadParticipant',
  'agentChatThreadTarget',
  'agentTurn',
  'agentMessage',
  'agentMessagePart',
  'agentMessageReaction',
];

export const findDirectMessagePermissionObject = ({
  metadataMaps,
  flatObjectMetadata,
}: {
  metadataMaps: Pick<
    PermissionsRowAccessRequest['metadataMaps'],
    'featureFlagsMap' | 'flatFieldMetadataMaps'
  >;
  flatObjectMetadata: Pick<
    PermissionsRowAccessRequest['flatObjectMetadata'],
    'universalIdentifier'
  >;
}): DirectMessagePermissionObject | undefined => {
  const hasIdentityStorage =
    metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ] === true;
  const hasConversationType = isDefined(
    metadataMaps.flatFieldMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.agentChatThread.fields.conversationType
        .universalIdentifier
    ],
  );

  if (!hasIdentityStorage && !hasConversationType) {
    return undefined;
  }

  return DIRECT_MESSAGE_PERMISSION_OBJECTS.find(
    (objectName) =>
      STANDARD_OBJECTS[objectName].universalIdentifier ===
      flatObjectMetadata.universalIdentifier,
  );
};
