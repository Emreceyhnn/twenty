import { randomBytes } from 'node:crypto';

import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessSqlRequest,
  type SqlCondition,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { DIRECT_MESSAGE_HISTORY_OBJECT_UNIVERSAL_IDENTIFIERS } from 'src/engine/permissions/private-record/constants/direct-message-history-object-universal-identifiers.constant';
import { getDirectMessageThreadRelationPath } from 'src/engine/permissions/private-record/utils/get-direct-message-thread-relation-path.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const PARAMETER_SUFFIX_BYTES = 5;

export const buildDirectMessagePairCondition = (
  request: PermissionsRowAccessSqlRequest,
): SqlCondition | undefined => {
  const relationPath = getDirectMessageThreadRelationPath(
    request.flatObjectMetadata,
  );

  if (
    !isDefined(relationPath) ||
    !request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ]
  ) {
    return undefined;
  }

  const parameterSuffix = randomBytes(PARAMETER_SUFFIX_BYTES).toString('hex');
  const memberParameter = `directMessageMember_${parameterSuffix}`;
  const { mainPrincipal } = request.principal;
  const memberId =
    'workspaceMemberId' in mainPrincipal
      ? mainPrincipal.workspaceMemberId
      : undefined;
  const isHistoryLifecycleMutation =
    (request.operationType === 'delete' ||
      request.operationType === 'soft-delete' ||
      request.operationType === 'restore') &&
    DIRECT_MESSAGE_HISTORY_OBJECT_UNIVERSAL_IDENTIFIERS.includes(
      request.flatObjectMetadata.universalIdentifier,
    );
  const parameters =
    isDefined(memberId) && !isHistoryLifecycleMutation
      ? { [memberParameter]: memberId }
      : {};
  const threadAlias =
    relationPath.length === 0
      ? escapeIdentifier(request.tableAlias)
      : escapeIdentifier(`directMessageThread_${parameterSuffix}`);
  const regularThreadCondition = `${threadAlias}."conversationType" <> 'DIRECT_MESSAGE'`;
  const firstMemberColumn = `${threadAlias}."directMessageFirstWorkspaceMemberId"`;
  const secondMemberColumn = `${threadAlias}."directMessageSecondWorkspaceMemberId"`;
  let sql =
    isDefined(memberId) && !isHistoryLifecycleMutation
      ? `(${regularThreadCondition} OR (${firstMemberColumn} <> ${secondMemberColumn} AND (${firstMemberColumn} = :${memberParameter} OR ${secondMemberColumn} = :${memberParameter})))`
      : regularThreadCondition;

  for (let index = relationPath.length - 1; index >= 0; index--) {
    const relation = relationPath[index];
    const parentAlias =
      index === relationPath.length - 1
        ? threadAlias
        : escapeIdentifier(`directMessageParent_${index}_${parameterSuffix}`);
    const sourceAlias =
      index === 0
        ? escapeIdentifier(request.tableAlias)
        : escapeIdentifier(
            `directMessageParent_${index - 1}_${parameterSuffix}`,
          );
    const foreignKey = `${sourceAlias}.${escapeIdentifier(relation.foreignKey)}`;
    const table = `${escapeIdentifier(getWorkspaceSchemaName(request.principal.workspaceId))}.${escapeIdentifier(relation.objectNameSingular)}`;

    sql = `EXISTS (SELECT 1 FROM ${table} AS ${parentAlias} WHERE ${parentAlias}."id" = ${foreignKey} AND (${sql}))`;

    if (relation.isNullable) {
      sql = `(${foreignKey} IS NULL OR ${sql})`;
    }
  }

  return { sql, parameters };
};
