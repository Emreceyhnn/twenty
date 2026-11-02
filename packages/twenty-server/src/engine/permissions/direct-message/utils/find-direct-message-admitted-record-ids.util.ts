import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessEvaluationRequest,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { type DirectMessageThreadPair } from 'src/engine/permissions/direct-message/types/direct-message-thread-pair.type';
import { DIRECT_MESSAGE_HISTORY_OBJECT_NAMES } from 'src/engine/permissions/direct-message/constants/direct-message-history-object-names.constant';
import { findDirectMessageRecordThreadIds } from 'src/engine/permissions/direct-message/utils/find-direct-message-record-thread-ids.util';
import { findDirectMessagePermissionObject } from 'src/engine/permissions/direct-message/utils/find-direct-message-permission-object.util';
import { getDirectMessageThreadPairFromRecord } from 'src/engine/permissions/direct-message/utils/get-direct-message-thread-pair-from-record.util';
import { hasDirectMessageThreadIdentity } from 'src/engine/permissions/direct-message/utils/has-direct-message-thread-identity.util';
import { getPermissionsPrincipalWorkspaceMemberId } from 'src/engine/permissions/principal/utils/get-permissions-principal-workspace-member-id.util';
import { isWorkspaceMemberInDirectMessagePair } from 'src/engine/permissions/direct-message/utils/is-workspace-member-in-direct-message-pair.util';

export const findDirectMessageAdmittedRecordIds = async (
  request: PermissionsRowAccessEvaluationRequest,
): Promise<Set<string>> => {
  const objectName = findDirectMessagePermissionObject(request);
  const { records, context, principal } = request;

  if (!isDefined(objectName) || !isNonEmptyArray(records)) {
    return new Set(records.map(({ id }) => id));
  }

  const isThread = objectName === 'agentChatThread';
  const isHistoryLifecycleMutation =
    DIRECT_MESSAGE_HISTORY_OBJECT_NAMES.includes(objectName) &&
    ['delete', 'soft-delete', 'restore'].includes(request.operationType);
  const workspaceMemberId = isHistoryLifecycleMutation
    ? undefined
    : getPermissionsPrincipalWorkspaceMemberId(principal);
  const threadIdByRecord = await findDirectMessageRecordThreadIds({
    objectName,
    records,
    context,
  });

  const hasIdentityStorage =
    request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ] === true;
  const threadPairs = new Map<string, DirectMessageThreadPair>();
  const threadPairByRecord = new Map<
    RowAccessRecord,
    DirectMessageThreadPair
  >();

  if (isThread) {
    for (const record of records) {
      const pair = getDirectMessageThreadPairFromRecord({
        record,
        hasIdentityStorage,
      });

      if (isDefined(pair)) {
        threadPairByRecord.set(record, pair);
      }
    }
  }

  const missingThreadIds = [
    ...new Set(
      [...threadIdByRecord]
        .filter(([record]) => !threadPairByRecord.has(record))
        .map(([, threadId]) => threadId),
    ),
  ];

  if (isNonEmptyArray(missingThreadIds)) {
    const missingThreadPairs = await context.findDirectMessageThreadPairs({
      threadIds: missingThreadIds,
    });

    for (const [threadId, pair] of missingThreadPairs) {
      threadPairs.set(threadId, pair);
    }
  }

  const pairAdmittedThreadIds = new Set(
    [...threadPairs]
      .filter(
        ([, directMessagePair]) =>
          (hasIdentityStorage ||
            !hasDirectMessageThreadIdentity(directMessagePair)) &&
          isWorkspaceMemberInDirectMessagePair({
            directMessagePair,
            workspaceMemberId,
          }),
      )
      .map(([threadId]) => threadId),
  );
  const directMessageThreadIds = isThread
    ? []
    : [...threadPairs]
        .filter(
          ([threadId, pair]) =>
            pairAdmittedThreadIds.has(threadId) &&
            hasDirectMessageThreadIdentity(pair),
        )
        .map(([threadId]) => threadId);
  const admittedParentThreadIds = isNonEmptyArray(directMessageThreadIds)
    ? await context.findAdmittedDirectMessageThreadIds({
        threadIds: directMessageThreadIds,
        principal,
        operationType: request.operationType === 'select' ? 'select' : 'update',
      })
    : new Set<string>();
  const directMessageThreadIdSet = new Set(directMessageThreadIds);

  const admittedRecordIds = new Set(records.map(({ id }) => id));

  for (const record of records) {
    if (
      objectName === 'attachment' &&
      record.targetAgentChatThreadId === null
    ) {
      continue;
    }

    const threadId = threadIdByRecord.get(record);
    const snapshotPair = threadPairByRecord.get(record);
    const isSnapshotPairAdmitted =
      isDefined(snapshotPair) &&
      (hasIdentityStorage || !hasDirectMessageThreadIdentity(snapshotPair)) &&
      isWorkspaceMemberInDirectMessagePair({
        directMessagePair: snapshotPair,
        workspaceMemberId,
      });
    const isStoredPairAdmitted =
      isDefined(threadId) && pairAdmittedThreadIds.has(threadId);
    const isPairAdmitted = isDefined(snapshotPair)
      ? isSnapshotPairAdmitted
      : isStoredPairAdmitted;
    const isParentAdmitted =
      isDefined(threadId) &&
      (!directMessageThreadIdSet.has(threadId) ||
        admittedParentThreadIds.has(threadId));

    if (!isPairAdmitted || (!isThread && !isParentAdmitted)) {
      admittedRecordIds.delete(record.id);
    }
  }

  return admittedRecordIds;
};
