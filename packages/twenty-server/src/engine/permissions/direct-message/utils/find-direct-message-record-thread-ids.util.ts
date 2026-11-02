import { isNonEmptyString } from '@sniptt/guards';
import { isNonEmptyArray } from 'twenty-shared/utils';

import {
  type RowAccessEvaluationContext,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { type DirectMessagePermissionObject } from 'src/engine/permissions/direct-message/types/direct-message-permission-object.type';

export const findDirectMessageRecordThreadIds = async ({
  objectName,
  records,
  context,
}: {
  objectName: DirectMessagePermissionObject;
  records: RowAccessRecord[];
  context: Pick<RowAccessEvaluationContext, 'findAgentChatMessageThreadIds'>;
}): Promise<Map<RowAccessRecord, string>> => {
  const isMessageChild =
    objectName === 'agentMessagePart' || objectName === 'agentMessageReaction';
  const messageIds = isMessageChild
    ? [
        ...new Set(
          records.map(({ messageId }) => messageId).filter(isNonEmptyString),
        ),
      ]
    : [];
  const threadIdByMessageId = isNonEmptyArray(messageIds)
    ? await context.findAgentChatMessageThreadIds({ messageIds })
    : new Map<string, string>();
  const threadIdByRecord = new Map<RowAccessRecord, string>();
  const findThreadId = (record: RowAccessRecord) => {
    if (objectName === 'agentChatThread') {
      return record.id;
    }

    if (objectName === 'attachment') {
      return record.targetAgentChatThreadId;
    }

    if (!isMessageChild) {
      return record.threadId;
    }

    return isNonEmptyString(record.messageId)
      ? threadIdByMessageId.get(record.messageId)
      : undefined;
  };

  for (const record of records) {
    const threadId = findThreadId(record);

    if (isNonEmptyString(threadId)) {
      threadIdByRecord.set(record, threadId);
    }
  }

  return threadIdByRecord;
};
