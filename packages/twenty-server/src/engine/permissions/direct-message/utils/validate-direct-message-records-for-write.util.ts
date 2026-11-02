import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';

import {
  type PermissionsRowAccessEvaluationRequest,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { findDirectMessageAdmittedRecordIds } from 'src/engine/permissions/direct-message/utils/find-direct-message-admitted-record-ids.util';
import { findDirectMessagePermissionObject } from 'src/engine/permissions/direct-message/utils/find-direct-message-permission-object.util';
import { validateDirectMessageRecordMutations } from 'src/engine/permissions/direct-message/utils/validate-direct-message-record-mutations.util';
import { hasDirectMessageThreadIdentity } from 'src/engine/permissions/direct-message/utils/has-direct-message-thread-identity.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/permissions/permissions.exception';

export const validateDirectMessageRecordsForWrite = async (
  request: PermissionsRowAccessEvaluationRequest & {
    recordsBefore?: RowAccessRecord[];
  },
): Promise<void> => {
  const objectName = findDirectMessagePermissionObject(request);

  if (!isDefined(objectName)) {
    return;
  }

  if (objectName === 'agentChatThread' && request.operationType === 'insert') {
    const createsDirectMessage = request.records.some(
      ({
        conversationType,
        directMessageFirstWorkspaceMemberId,
        directMessageSecondWorkspaceMemberId,
      }) =>
        hasDirectMessageThreadIdentity({
          conversationType,
          directMessageFirstWorkspaceMemberId,
          directMessageSecondWorkspaceMemberId,
        }),
    );

    if (!createsDirectMessage) {
      return;
    }

    throw new PermissionsException(
      doNotTranslate(
        'Direct messages cannot be created through the record API',
      ),
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }

  const admittedRecordIds = await findDirectMessageAdmittedRecordIds(request);

  if (request.records.every(({ id }) => admittedRecordIds.has(id))) {
    await validateDirectMessageRecordMutations({
      records: request.records,
      recordsBefore: request.recordsBefore ?? [],
      objectName,
      context: request.context,
    });

    return;
  }

  throw new PermissionsException(
    doNotTranslate('Direct message access is required to write this record'),
    PermissionsExceptionCode.PERMISSION_DENIED,
  );
};
