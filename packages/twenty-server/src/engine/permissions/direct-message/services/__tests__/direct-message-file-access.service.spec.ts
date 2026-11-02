import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FeatureFlagKey } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { DirectMessageFileAccessService } from 'src/engine/permissions/direct-message/services/direct-message-file-access.service';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

describe('DirectMessageFileAccessService', () => {
  const workspaceId = '20202020-0000-4000-8000-000000000001';
  const fileId = '20202020-0000-4000-8000-000000000002';
  const directMessageThreadId = '20202020-0000-4000-8000-000000000003';
  const regularThreadId = '20202020-0000-4000-8000-000000000004';
  const authContext = {
    type: 'user',
    workspace: { id: workspaceId },
    workspaceMemberId: '20202020-0000-4000-8000-000000000005',
  } as WorkspaceAuthContext;
  const directMessagePair = {
    id: directMessageThreadId,
    conversationType: 'DIRECT_MESSAGE',
    directMessageFirstWorkspaceMemberId: '20202020-0000-4000-8000-000000000006',
    directMessageSecondWorkspaceMemberId:
      '20202020-0000-4000-8000-000000000007',
  };
  const regularThread = {
    id: regularThreadId,
    conversationType: 'STANDARD',
    directMessageFirstWorkspaceMemberId: null,
    directMessageSecondWorkspaceMemberId: null,
  };

  const partRepository = { find: jest.fn() };
  const messageRepository = { find: jest.fn() };
  const threadRepository = { find: jest.fn() };
  const readableThreadRepository = { find: jest.fn() };
  const executeInWorkspaceContext = jest.fn((work: () => Promise<unknown>) =>
    work(),
  );
  const getRepositoryWithContextPermissions = jest.fn(
    () => readableThreadRepository,
  );
  const workspaceOrmManager = {
    executeInWorkspaceContext,
    getRepositoryWithContextPermissions,
    getRepository: jest.fn((objectName: string) => {
      if (objectName === 'agentMessagePart') {
        return partRepository;
      }

      if (objectName === 'agentMessage') {
        return messageRepository;
      }

      return threadRepository;
    }),
  } as unknown as WorkspaceOrmManager;
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      featureFlagsMap: {
        [FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED]: true,
      },
      flatFieldMetadataMapsOrm: { byUniversalIdentifier: {} },
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          [STANDARD_OBJECTS.agentChatThread.universalIdentifier]: {
            universalIdentifier:
              STANDARD_OBJECTS.agentChatThread.universalIdentifier,
            nameSingular: 'agentChatThread',
          },
        },
      },
    }),
  } as unknown as WorkspaceCacheService;
  const service = new DirectMessageFileAccessService(
    workspaceOrmManager,
    workspaceCacheService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    partRepository.find.mockResolvedValue([
      { fileId, messageId: 'direct-message' },
    ]);
    messageRepository.find.mockResolvedValue([
      { id: 'direct-message', threadId: directMessageThreadId },
    ]);
    threadRepository.find.mockResolvedValue([directMessagePair]);
    readableThreadRepository.find.mockResolvedValue([]);
  });

  it('rejects reusing a known DM file without access and includes deleted references', async () => {
    await expect(
      service.assertFilesReadableOrThrow({
        workspaceId,
        fileIds: [fileId],
        authContext,
      }),
    ).rejects.toMatchObject({ extensions: { code: ErrorCode.NOT_FOUND } });

    for (const repository of [
      partRepository,
      messageRepository,
      threadRepository,
    ]) {
      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    }
  });

  it('allows reuse through an already readable reference while preserving the caller context', async () => {
    partRepository.find.mockResolvedValue([
      { fileId, messageId: 'direct-message' },
      { fileId, messageId: 'regular-message' },
    ]);
    messageRepository.find.mockResolvedValue([
      { id: 'direct-message', threadId: directMessageThreadId },
      { id: 'regular-message', threadId: regularThreadId },
    ]);
    threadRepository.find.mockResolvedValue([directMessagePair, regularThread]);
    readableThreadRepository.find.mockResolvedValue([{ id: regularThreadId }]);

    await expect(
      service.assertFilesReadableOrThrow({
        workspaceId,
        fileIds: [fileId],
        authContext,
      }),
    ).resolves.toBeUndefined();
    expect(executeInWorkspaceContext).toHaveBeenLastCalledWith(
      expect.any(Function),
      authContext,
    );
  });

  it('preserves ordinary attachments and unreferenced uploads without requiring a DM grant', async () => {
    messageRepository.find.mockResolvedValue([
      { id: 'direct-message', threadId: regularThreadId },
    ]);
    threadRepository.find.mockResolvedValue([regularThread]);

    await expect(
      service.assertFilesReadableOrThrow({
        workspaceId,
        fileIds: [fileId, '20202020-0000-4000-8000-000000000008'],
      }),
    ).resolves.toBeUndefined();
    expect(getRepositoryWithContextPermissions).not.toHaveBeenCalled();
  });
});
