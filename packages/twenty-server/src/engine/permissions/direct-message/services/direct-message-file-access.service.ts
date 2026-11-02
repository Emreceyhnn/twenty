import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { doNotTranslate } from 'twenty-shared/i18n';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { isSystemAuthContext } from 'src/engine/core-modules/auth/guards/is-system-auth-context.guard';
import { workspaceAuthContextStorage } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { NotFoundError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type AgentChatThreadWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-chat-thread.workspace-entity';
import { type AgentMessagePartWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-message-part.workspace-entity';
import { type AgentMessageWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-message.workspace-entity';
import { findDirectMessagePermissionObject } from 'src/engine/permissions/direct-message/utils/find-direct-message-permission-object.util';
import { findDirectMessageThreadPairs } from 'src/engine/permissions/direct-message/utils/find-direct-message-thread-pairs.util';
import { hasDirectMessageThreadIdentity } from 'src/engine/permissions/direct-message/utils/has-direct-message-thread-identity.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/permissions/permissions.exception';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@Injectable()
export class DirectMessageFileAccessService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async assertFilesReadableOrThrow({
    workspaceId,
    fileIds,
    authContext = workspaceAuthContextStorage.getStore(),
  }: {
    workspaceId: string;
    fileIds: string[];
    authContext?: WorkspaceAuthContext;
  }): Promise<void> {
    if (!isNonEmptyArray(fileIds)) {
      return;
    }

    const { threadIdsByFileId, protectedFileIds, threadObjectName } =
      await this.findFileReferences({ workspaceId, fileIds });

    if (!isNonEmptyArray(protectedFileIds)) {
      return;
    }

    if (
      !isDefined(authContext) ||
      authContext.workspace.id !== workspaceId ||
      isSystemAuthContext(authContext)
    ) {
      return this.throwFileNotFound();
    }

    const readableThreads = await this.workspaceOrmManager
      .executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager
            .getRepositoryWithContextPermissions<AgentChatThreadWorkspaceEntity>(
              threadObjectName,
            )
            .find({
              where: {
                id: In([
                  ...new Set(
                    protectedFileIds.flatMap(
                      (fileId) => threadIdsByFileId.get(fileId) ?? [],
                    ),
                  ),
                ]),
              },
              select: { id: true },
              withDeleted: true,
            }),
        authContext,
      )
      .catch((error: unknown) => {
        if (
          error instanceof PermissionsException &&
          error.code === PermissionsExceptionCode.PERMISSION_DENIED
        ) {
          return this.throwFileNotFound();
        }

        throw error;
      });
    const readableThreadIds = new Set(readableThreads.map(({ id }) => id));
    const hasUnreadableProtectedFile = protectedFileIds.some(
      (fileId) =>
        !(threadIdsByFileId.get(fileId) ?? []).some((threadId) =>
          readableThreadIds.has(threadId),
        ),
    );

    if (hasUnreadableProtectedFile) {
      this.throwFileNotFound();
    }
  }

  private async findFileReferences({
    workspaceId,
    fileIds,
  }: {
    workspaceId: string;
    fileIds: string[];
  }): Promise<{
    threadIdsByFileId: Map<string, string[]>;
    protectedFileIds: string[];
    threadObjectName: string;
  }> {
    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMapsOrm,
      featureFlagsMap,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMapsOrm',
      'featureFlagsMap',
    ]);
    const threadMetadata =
      flatObjectMetadataMaps.byUniversalIdentifier[
        STANDARD_OBJECTS.agentChatThread.universalIdentifier
      ];
    const metadataMaps = {
      flatFieldMetadataMaps: flatFieldMetadataMapsOrm,
      featureFlagsMap,
    };
    const emptyReferences = {
      threadIdsByFileId: new Map<string, string[]>(),
      protectedFileIds: [],
      threadObjectName: threadMetadata?.nameSingular ?? 'agentChatThread',
    };

    if (
      !isDefined(threadMetadata) ||
      !isDefined(
        findDirectMessagePermissionObject({
          metadataMaps,
          flatObjectMetadata: threadMetadata,
        }),
      )
    ) {
      return emptyReferences;
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const partRepository =
        this.workspaceOrmManager.getRepository<AgentMessagePartWorkspaceEntity>(
          'agentMessagePart',
          { shouldBypassPermissionChecks: true },
        );
      const parts = await partRepository.find({
        where: { fileId: In([...new Set(fileIds)]) },
        select: { fileId: true, messageId: true },
        withDeleted: true,
      });

      if (!isNonEmptyArray(parts)) {
        return emptyReferences;
      }

      const messages = await this.workspaceOrmManager
        .getRepository<AgentMessageWorkspaceEntity>('agentMessage', {
          shouldBypassPermissionChecks: true,
        })
        .find({
          where: {
            id: In([...new Set(parts.map(({ messageId }) => messageId))]),
          },
          select: { id: true, threadId: true },
          withDeleted: true,
        });
      const threadIdByMessageId = new Map(
        messages.map(({ id, threadId }) => [id, threadId]),
      );
      const threadIdsByFileId = new Map<string, string[]>();

      for (const { fileId, messageId } of parts) {
        const threadId = threadIdByMessageId.get(messageId);

        if (!isNonEmptyString(fileId) || !isNonEmptyString(threadId)) {
          continue;
        }

        threadIdsByFileId.set(fileId, [
          ...(threadIdsByFileId.get(fileId) ?? []),
          threadId,
        ]);
      }

      const pairs = await findDirectMessageThreadPairs({
        repository:
          this.workspaceOrmManager.getRepository<AgentChatThreadWorkspaceEntity>(
            threadMetadata.nameSingular,
            { shouldBypassPermissionChecks: true },
          ),
        metadataMaps,
        threadIds: [...new Set(messages.map(({ threadId }) => threadId))],
      });

      return {
        threadIdsByFileId,
        protectedFileIds: [...threadIdsByFileId]
          .filter(([, threadIds]) =>
            threadIds.some((threadId) => {
              const pair = pairs.get(threadId);

              return isDefined(pair) && hasDirectMessageThreadIdentity(pair);
            }),
          )
          .map(([fileId]) => fileId),
        threadObjectName: threadMetadata.nameSingular,
      };
    }, buildSystemAuthContext(workspaceId));
  }

  private throwFileNotFound(): never {
    throw new NotFoundError(doNotTranslate('File not found'), {
      userFriendlyMessage: msg`File not found.`,
    });
  }
}
