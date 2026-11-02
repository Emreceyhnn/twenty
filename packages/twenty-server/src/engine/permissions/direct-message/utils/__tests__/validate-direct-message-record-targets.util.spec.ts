import { RelationType } from 'src/engine/metadata-modules/field-metadata/interfaces/relation-type.interface';
import { type DirectMessageThreadPair } from 'src/engine/permissions/direct-message/types/direct-message-thread-pair.type';
import { validateDirectMessageRecordTargets } from 'src/engine/permissions/direct-message/utils/validate-direct-message-record-targets.util';
import { PermissionsExceptionCode } from 'src/engine/permissions/permissions.exception';

const directMessagePair: DirectMessageThreadPair = {
  conversationType: 'DIRECT_MESSAGE',
  directMessageFirstWorkspaceMemberId: 'member-one',
  directMessageSecondWorkspaceMemberId: 'member-two',
};
const targetRelations = [
  {
    fieldName: 'targetCompany',
    fieldMetadataId: 'company-field',
    relationType: RelationType.MANY_TO_ONE,
    targetObjectMetadataId: 'company-object',
    targetFieldMetadataId: 'company-inverse-field',
    joinColumnName: 'targetCompanyId',
  },
];

describe('validateDirectMessageRecordTargets', () => {
  it('requires independent target record access when attaching or changing a DM link', async () => {
    const request = {
      records: [{ id: 'link', threadId: 'dm', targetCompanyId: 'company' }],
      context: {
        findDirectMessageThreadPairs: async () =>
          new Map([['dm', directMessagePair]]),
      },
      targetRelations,
      findReadableRecordIds: jest.fn(async () => new Set<string>()),
    };

    await expect(
      validateDirectMessageRecordTargets(request),
    ).rejects.toMatchObject({
      code: PermissionsExceptionCode.PERMISSION_DENIED,
    });

    request.findReadableRecordIds.mockResolvedValue(new Set(['company']));

    await expect(
      validateDirectMessageRecordTargets(request),
    ).resolves.toBeUndefined();
  });

  it('preserves ordinary conversation links without adding new record checks', async () => {
    const findReadableRecordIds = jest.fn(async () => new Set<string>());

    await validateDirectMessageRecordTargets({
      records: [{ id: 'link', threadId: 'chat', targetCompanyId: 'company' }],
      context: {
        findDirectMessageThreadPairs: async () =>
          new Map([
            [
              'chat',
              {
                conversationType: 'STANDARD',
                directMessageFirstWorkspaceMemberId: null,
                directMessageSecondWorkspaceMemberId: null,
              },
            ],
          ]),
      },
      targetRelations,
      findReadableRecordIds,
    });

    expect(findReadableRecordIds).not.toHaveBeenCalled();
  });
});
