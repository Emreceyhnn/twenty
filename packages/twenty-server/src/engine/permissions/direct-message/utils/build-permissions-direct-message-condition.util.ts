import { doNotTranslate } from 'twenty-shared/i18n';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessSqlRequest,
  type SqlCondition,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { buildDirectMessageTableExpression } from 'src/engine/permissions/direct-message/utils/build-direct-message-table-expression.util';
import { buildDirectMessageThreadAccessCondition } from 'src/engine/permissions/direct-message/utils/build-direct-message-thread-access-condition.util';
import { buildDirectMessageThreadPairCondition } from 'src/engine/permissions/direct-message/utils/build-direct-message-thread-pair-condition.util';
import { findDirectMessagePermissionObject } from 'src/engine/permissions/direct-message/utils/find-direct-message-permission-object.util';
import { DIRECT_MESSAGE_HISTORY_OBJECT_NAMES } from 'src/engine/permissions/direct-message/constants/direct-message-history-object-names.constant';
import { getPermissionsPrincipalWorkspaceMemberId } from 'src/engine/permissions/principal/utils/get-permissions-principal-workspace-member-id.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const DIRECT_MESSAGE_THREAD_ALIAS = doNotTranslate(
  'directMessagePermissionThread',
);
const DIRECT_MESSAGE_MESSAGE_ALIAS = doNotTranslate(
  'directMessagePermissionMessage',
);

export const buildPermissionsDirectMessageCondition = (
  request: PermissionsRowAccessSqlRequest,
): SqlCondition | false | undefined => {
  const objectName = findDirectMessagePermissionObject(request);

  if (!isDefined(objectName)) {
    return undefined;
  }

  if (objectName === 'agentChatThread') {
    return buildDirectMessageThreadPairCondition({
      tableAlias: request.tableAlias,
      workspaceMemberId: ['delete', 'soft-delete', 'restore'].includes(
        request.operationType,
      )
        ? undefined
        : getPermissionsPrincipalWorkspaceMemberId(request.principal),
      metadataMaps: request.metadataMaps,
    });
  }

  const threadObjectMetadata =
    request.metadataMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.agentChatThread.universalIdentifier
    ];

  if (!isDefined(threadObjectMetadata)) {
    return false;
  }

  const threadTable = buildDirectMessageTableExpression({
    workspaceId: request.principal.workspaceId,
    flatObjectMetadata: threadObjectMetadata,
  });
  const threadAlias = escapeIdentifier(DIRECT_MESSAGE_THREAD_ALIAS);
  const sourceAlias = escapeIdentifier(request.tableAlias);
  const pairCondition = buildDirectMessageThreadAccessCondition({
    tableAlias: DIRECT_MESSAGE_THREAD_ALIAS,
    request,
    threadObjectMetadata,
    shouldExcludeDirectMessages:
      DIRECT_MESSAGE_HISTORY_OBJECT_NAMES.includes(objectName) &&
      ['delete', 'soft-delete', 'restore'].includes(request.operationType),
  });
  const isMessageChild =
    objectName === 'agentMessagePart' || objectName === 'agentMessageReaction';

  if (!isMessageChild) {
    const threadColumn =
      objectName === 'attachment' ? 'targetAgentChatThreadId' : 'threadId';
    const threadIdExpression = `${sourceAlias}.${escapeIdentifier(threadColumn)}`;
    const condition = `EXISTS (SELECT 1 FROM ${threadTable} AS ${threadAlias} WHERE ${threadAlias}."id" = ${threadIdExpression} AND (${pairCondition.sql}))`;

    return {
      sql: doNotTranslate(
        objectName === 'attachment'
          ? `(${threadIdExpression} IS NULL OR ${condition})`
          : condition,
      ),
      parameters: pairCondition.parameters,
    };
  }

  const messageObjectMetadata =
    request.metadataMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.agentMessage.universalIdentifier
    ];

  if (!isDefined(messageObjectMetadata)) {
    return false;
  }

  const messageTable = buildDirectMessageTableExpression({
    workspaceId: request.principal.workspaceId,
    flatObjectMetadata: messageObjectMetadata,
  });
  const messageAlias = escapeIdentifier(DIRECT_MESSAGE_MESSAGE_ALIAS);

  return {
    sql: doNotTranslate(
      `EXISTS (SELECT 1 FROM ${messageTable} AS ${messageAlias} INNER JOIN ${threadTable} AS ${threadAlias} ON ${threadAlias}."id" = ${messageAlias}."threadId" WHERE ${messageAlias}."id" = ${sourceAlias}."messageId" AND (${pairCondition.sql}))`,
    ),
    parameters: pairCondition.parameters,
  };
};
