import { isString } from '@sniptt/guards';
import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessEvaluationRequest,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { DIRECT_MESSAGE_HISTORY_OBJECT_NAMES } from 'src/engine/permissions/direct-message/constants/direct-message-history-object-names.constant';
import { type DirectMessagePermissionObject } from 'src/engine/permissions/direct-message/types/direct-message-permission-object.type';
import { type DirectMessageThreadPair } from 'src/engine/permissions/direct-message/types/direct-message-thread-pair.type';
import { findDirectMessageRecordThreadIds } from 'src/engine/permissions/direct-message/utils/find-direct-message-record-thread-ids.util';
import { hasDirectMessageThreadIdentity } from 'src/engine/permissions/direct-message/utils/has-direct-message-thread-identity.util';
import { isWorkspaceMemberInDirectMessagePair } from 'src/engine/permissions/direct-message/utils/is-workspace-member-in-direct-message-pair.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/permissions/permissions.exception';

export const validateDirectMessageRecordMutations = async ({
  records,
  recordsBefore,
  objectName,
  context,
}: Pick<PermissionsRowAccessEvaluationRequest, 'records' | 'context'> & {
  recordsBefore: RowAccessRecord[];
  objectName: DirectMessagePermissionObject;
}): Promise<void> => {
  const threadIdByRecord = await findDirectMessageRecordThreadIds({
    objectName,
    records: [...recordsBefore, ...records],
    context,
  });
  const threadIds = [...new Set(threadIdByRecord.values())];
  const pairs = isNonEmptyArray(threadIds)
    ? await context.findDirectMessageThreadPairs({ threadIds })
    : new Map<string, DirectMessageThreadPair>();
  const beforeById = new Map(
    recordsBefore.map((record) => [record.id, record]),
  );
  const isHistory = DIRECT_MESSAGE_HISTORY_OBJECT_NAMES.includes(objectName);

  for (const record of records) {
    const before = beforeById.get(record.id);
    const threadId = threadIdByRecord.get(record);
    const previousThreadId = isDefined(before)
      ? threadIdByRecord.get(before)
      : undefined;
    const pair = isDefined(threadId) ? pairs.get(threadId) : undefined;
    const previousPair = isDefined(previousThreadId)
      ? pairs.get(previousThreadId)
      : undefined;
    const isDirectMessage =
      (objectName === 'agentChatThread' &&
        hasDirectMessageThreadIdentity({
          conversationType: record.conversationType,
          directMessageFirstWorkspaceMemberId:
            record.directMessageFirstWorkspaceMemberId,
          directMessageSecondWorkspaceMemberId:
            record.directMessageSecondWorkspaceMemberId,
        })) ||
      (isDefined(pair) && hasDirectMessageThreadIdentity(pair));
    const wasDirectMessage =
      isDefined(previousPair) && hasDirectMessageThreadIdentity(previousPair);
    const changesThread = isDefined(before) && previousThreadId !== threadId;
    const isOutsidePairParticipant =
      isDirectMessage &&
      objectName === 'agentChatThreadParticipant' &&
      isDefined(pair) &&
      !isWorkspaceMemberInDirectMessagePair({
        directMessagePair: pair,
        workspaceMemberId: isString(record.workspaceMemberId)
          ? record.workspaceMemberId
          : undefined,
      });

    if (
      ((isDirectMessage || wasDirectMessage) && (isHistory || changesThread)) ||
      isOutsidePairParticipant
    ) {
      throw new PermissionsException(
        doNotTranslate(
          'Direct message history and its fixed member pair cannot be changed through the record API',
        ),
        PermissionsExceptionCode.PERMISSION_DENIED,
      );
    }
  }
};
