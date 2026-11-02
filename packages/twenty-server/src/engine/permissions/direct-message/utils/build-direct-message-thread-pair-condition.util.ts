import { isNonEmptyString } from '@sniptt/guards';
import { doNotTranslate } from 'twenty-shared/i18n';
import { FeatureFlagKey } from 'twenty-shared/types';

import {
  type PermissionsMetadataMaps,
  type SqlCondition,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

export const buildDirectMessageThreadPairCondition = ({
  tableAlias,
  workspaceMemberId,
  metadataMaps,
}: {
  tableAlias: string;
  workspaceMemberId?: string;
  metadataMaps: PermissionsMetadataMaps;
}): SqlCondition => {
  const alias = escapeIdentifier(tableAlias);
  const regularConversationCondition = doNotTranslate(
    `${alias}."conversationType" IS DISTINCT FROM 'DIRECT_MESSAGE'`,
  );
  const hasIdentityStorage =
    metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ] === true;

  if (!hasIdentityStorage) {
    return { sql: regularConversationCondition, parameters: {} };
  }

  const firstMemberColumn = doNotTranslate(
    `${alias}."directMessageFirstWorkspaceMemberId"`,
  );
  const secondMemberColumn = doNotTranslate(
    `${alias}."directMessageSecondWorkspaceMemberId"`,
  );
  const regularThreadCondition = doNotTranslate(
    `(${regularConversationCondition} AND ${firstMemberColumn} IS NULL AND ${secondMemberColumn} IS NULL)`,
  );

  if (!isNonEmptyString(workspaceMemberId)) {
    return { sql: regularThreadCondition, parameters: {} };
  }

  return {
    sql: doNotTranslate(
      `(${regularThreadCondition} OR (${firstMemberColumn} IS NOT NULL AND ${secondMemberColumn} IS NOT NULL AND ${firstMemberColumn} <> ${secondMemberColumn} AND (${firstMemberColumn} = :directMessageWorkspaceMemberId OR ${secondMemberColumn} = :directMessageWorkspaceMemberId)))`,
    ),
    parameters: { directMessageWorkspaceMemberId: workspaceMemberId },
  };
};
