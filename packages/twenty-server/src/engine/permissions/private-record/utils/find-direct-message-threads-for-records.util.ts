import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  type RowAccessEvaluationContext,
  type RowAccessRecord,
} from 'src/engine/permissions/combine/types/row-access-policy.type';
import { getDirectMessageThreadRelationPath } from 'src/engine/permissions/private-record/utils/get-direct-message-thread-relation-path.util';

export const findDirectMessageThreadsForRecords = async ({
  flatObjectMetadata,
  records,
  findRelatedRecords,
}: Pick<RowAccessEvaluationContext, 'findRelatedRecords'> & {
  flatObjectMetadata: FlatObjectMetadata;
  records: RowAccessRecord[];
}): Promise<Map<string, RowAccessRecord | null>> => {
  const relationPath = getDirectMessageThreadRelationPath(flatObjectMetadata);
  const threadsByRecordId = new Map<string, RowAccessRecord | null>();

  if (!isDefined(relationPath)) {
    return threadsByRecordId;
  }

  const requiredProperty = relationPath[0]?.foreignKey ?? 'conversationType';
  const incompleteRecordIds = records
    .filter((record) => {
      const isPartialDirectMessage =
        relationPath.length === 0 &&
        record.conversationType === 'DIRECT_MESSAGE' &&
        (!('directMessageFirstWorkspaceMemberId' in record) ||
          !('directMessageSecondWorkspaceMemberId' in record));

      return !(requiredProperty in record) || isPartialDirectMessage;
    })
    .map(({ id }) => id);
  const storedRecords = isNonEmptyArray(incompleteRecordIds)
    ? ((await findRelatedRecords?.({
        objectNameSingular: flatObjectMetadata.nameSingular,
        recordIds: incompleteRecordIds,
      })) ?? [])
    : [];
  const storedRecordsById = new Map(
    storedRecords.map((record) => [record.id, record]),
  );
  let recordsByOriginalId = new Map<string, RowAccessRecord>(
    records.map((record) => [
      record.id,
      { ...storedRecordsById.get(record.id), ...record },
    ]),
  );

  for (const relation of relationPath) {
    const relatedIds = [
      ...new Set(
        [...recordsByOriginalId.values()]
          .map((record) => record[relation.foreignKey])
          .filter(isNonEmptyString),
      ),
    ];
    const relatedRecords = isNonEmptyArray(relatedIds)
      ? ((await findRelatedRecords?.({
          objectNameSingular: relation.objectNameSingular,
          recordIds: relatedIds,
        })) ?? [])
      : [];
    const relatedRecordsById = new Map(
      relatedRecords.map((record) => [record.id, record]),
    );
    const nextRecordsByOriginalId = new Map<string, RowAccessRecord>();

    for (const [originalId, record] of recordsByOriginalId) {
      const relatedId = record[relation.foreignKey];

      if (relation.isNullable && relatedId === null) {
        threadsByRecordId.set(originalId, null);
        continue;
      }

      const relatedRecord = isNonEmptyString(relatedId)
        ? relatedRecordsById.get(relatedId)
        : undefined;

      if (isDefined(relatedRecord)) {
        nextRecordsByOriginalId.set(originalId, relatedRecord);
      }
    }

    recordsByOriginalId = nextRecordsByOriginalId;
  }

  for (const [originalId, thread] of recordsByOriginalId) {
    threadsByRecordId.set(originalId, thread);
  }

  return threadsByRecordId;
};
