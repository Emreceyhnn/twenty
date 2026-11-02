import { isNonEmptyString } from '@sniptt/guards';
import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type PermissionsRowAccessEvaluationRequest } from 'src/engine/permissions/combine/types/row-access-policy.type';
import { DIRECT_MESSAGE_HISTORY_OBJECT_UNIVERSAL_IDENTIFIERS } from 'src/engine/permissions/private-record/constants/direct-message-history-object-universal-identifiers.constant';
import { getDirectMessageThreadRelationPath } from 'src/engine/permissions/private-record/utils/get-direct-message-thread-relation-path.util';
import { findDirectMessageThreadsForRecords } from 'src/engine/permissions/private-record/utils/find-direct-message-threads-for-records.util';

export const findDirectMessagePairAdmittedRecordIds = async (
  request: PermissionsRowAccessEvaluationRequest,
): Promise<Set<string>> => {
  const relationPath = getDirectMessageThreadRelationPath(
    request.flatObjectMetadata,
  );

  if (
    !isDefined(relationPath) ||
    !request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ]
  ) {
    return new Set(request.records.map(({ id }) => id));
  }

  const admittedIds = new Set<string>();
  const threadsByRecordId = await findDirectMessageThreadsForRecords({
    flatObjectMetadata: request.flatObjectMetadata,
    records: request.records,
    findRelatedRecords: request.context.findRelatedRecords,
  });

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

  for (const [originalId, thread] of threadsByRecordId) {
    if (thread === null || thread.conversationType === 'STANDARD') {
      admittedIds.add(originalId);
      continue;
    }

    if (
      thread.conversationType === 'DIRECT_MESSAGE' &&
      !isHistoryLifecycleMutation &&
      isDefined(memberId) &&
      isNonEmptyString(thread.directMessageFirstWorkspaceMemberId) &&
      isNonEmptyString(thread.directMessageSecondWorkspaceMemberId) &&
      thread.directMessageFirstWorkspaceMemberId !==
        thread.directMessageSecondWorkspaceMemberId &&
      (thread.directMessageFirstWorkspaceMemberId === memberId ||
        thread.directMessageSecondWorkspaceMemberId === memberId)
    ) {
      admittedIds.add(originalId);
    }
  }

  return admittedIds;
};
