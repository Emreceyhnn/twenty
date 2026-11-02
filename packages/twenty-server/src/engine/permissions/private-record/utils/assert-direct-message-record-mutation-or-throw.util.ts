import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FeatureFlagKey } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessRequest,
  type RowAccessEvaluationContext,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/permissions/permissions.exception';
import { DIRECT_MESSAGE_HISTORY_OBJECT_UNIVERSAL_IDENTIFIERS } from 'src/engine/permissions/private-record/constants/direct-message-history-object-universal-identifiers.constant';
import { findDirectMessagePairAdmittedRecordIds } from 'src/engine/permissions/private-record/utils/find-direct-message-pair-admitted-record-ids.util';
import { findDirectMessageThreadsForRecords } from 'src/engine/permissions/private-record/utils/find-direct-message-threads-for-records.util';
import { getDirectMessageThreadRelationPath } from 'src/engine/permissions/private-record/utils/get-direct-message-thread-relation-path.util';

export const assertDirectMessageRecordMutationOrThrow = async ({
  recordsBefore,
  recordsAfter,
  context,
  ...request
}: PermissionsRowAccessRequest & {
  recordsBefore: Record<string, unknown>[];
  recordsAfter: Record<string, unknown>[];
  context: RowAccessEvaluationContext;
}): Promise<void> => {
  const relationPath = getDirectMessageThreadRelationPath(
    request.flatObjectMetadata,
  );

  if (
    !isDefined(relationPath) ||
    !request.metadataMaps.featureFlagsMap[
      FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
    ]
  ) {
    return;
  }

  const relationProperty = relationPath[0]?.foreignKey ?? 'conversationType';
  const normalizeRecord = ({
    record,
    index,
  }: {
    record: Record<string, unknown>;
    index: number;
  }): RowAccessRecord => ({
    [relationProperty]:
      relationProperty === 'conversationType' ? 'STANDARD' : null,
    ...record,
    id: isNonEmptyString(record.id) ? record.id : `pending-record-${index}`,
  });
  const before = recordsBefore.map((record, index) =>
    normalizeRecord({ record, index }),
  );
  const after = recordsAfter.map((record, index) =>
    normalizeRecord({ record, index }),
  );
  const [threadsBefore, threadsAfter, admittedIds] = await Promise.all([
    findDirectMessageThreadsForRecords({
      ...request,
      records: before,
      findRelatedRecords: context.findRelatedRecords,
    }),
    findDirectMessageThreadsForRecords({
      ...request,
      records: after,
      findRelatedRecords: context.findRelatedRecords,
    }),
    findDirectMessagePairAdmittedRecordIds({
      ...request,
      records: after,
      context,
    }),
  ]);
  const beforeById = new Map(before.map((record) => [record.id, record]));
  const isHistoryObject =
    DIRECT_MESSAGE_HISTORY_OBJECT_UNIVERSAL_IDENTIFIERS.includes(
      request.flatObjectMetadata.universalIdentifier,
    );

  for (const record of after) {
    const previous = beforeById.get(record.id);
    const thread = threadsAfter.get(record.id);
    const wasDirectMessage =
      threadsBefore.get(record.id)?.conversationType === 'DIRECT_MESSAGE';
    const isDirectMessage = thread?.conversationType === 'DIRECT_MESSAGE';
    const changesThread =
      isDefined(previous) &&
      previous[relationProperty] !== record[relationProperty];
    const isOutsidePairParticipant =
      isDirectMessage &&
      request.flatObjectMetadata.universalIdentifier ===
        STANDARD_OBJECTS.agentChatThreadParticipant.universalIdentifier &&
      record.workspaceMemberId !== thread.directMessageFirstWorkspaceMemberId &&
      record.workspaceMemberId !== thread.directMessageSecondWorkspaceMemberId;

    if (
      !admittedIds.has(record.id) ||
      ((wasDirectMessage || isDirectMessage) &&
        (isHistoryObject || changesThread)) ||
      isOutsidePairParticipant
    ) {
      throw new PermissionsException(
        PermissionsExceptionMessage.PERMISSION_DENIED,
        PermissionsExceptionCode.PERMISSION_DENIED,
      );
    }
  }
};
