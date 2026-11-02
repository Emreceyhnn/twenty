import { Inject, Injectable } from '@nestjs/common';

import {
  FeatureFlagKey,
  RecordShareAccessLevel,
  RecordSharePrincipalType,
  RecordShareRowCause,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { AgentChatDirectMessageIdentityService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-direct-message-identity.service';
import { AgentChatSharingService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-sharing.service';
import { getAgentChatDirectMessagePeerOrThrow } from 'src/engine/metadata-modules/ai/ai-chat/utils/get-agent-chat-direct-message-peer-or-throw.util';
import { findAgentChatFlatObjectMetadata } from 'src/engine/metadata-modules/ai/ai-chat/utils/find-agent-chat-flat-object-metadata.util';
import { normalizeAgentChatDirectMessagePairOrThrow } from 'src/engine/metadata-modules/ai/ai-chat/utils/normalize-agent-chat-direct-message-pair-or-throw.util';
import { throwAgentChatThreadNotFound } from 'src/engine/metadata-modules/ai/ai-chat/utils/throw-agent-chat-thread-not-found.util';
import { type AgentHistoryRepository } from 'src/engine/metadata-modules/ai/ai-history/repositories/agent-history-repository';
import { getAgentHistoryRepositoryToken } from 'src/engine/metadata-modules/ai/ai-history/repositories/inject-agent-history-repository.decorator';
import { type AgentChatThreadWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-chat-thread.workspace-entity';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import { RecordAccessPolicyService } from 'src/engine/permissions/combine/services/record-access-policy.service';
import { RecordShareStorageService } from 'src/engine/permissions/record-share/services/record-share-storage.service';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

type DirectMessageAccessArgs = {
  workspaceId: string;
  workspaceMemberId: string;
  peerWorkspaceMemberId: string;
};

@Injectable()
export class AgentChatDirectMessageService {
  @Inject(getAgentHistoryRepositoryToken('agentChatThread'))
  private readonly threadRepository: AgentHistoryRepository<AgentChatThreadWorkspaceEntity>;

  @Inject(AgentChatDirectMessageIdentityService)
  private readonly identityService: AgentChatDirectMessageIdentityService;

  @Inject(AgentChatSharingService)
  private readonly sharingService: AgentChatSharingService;

  @Inject(WorkspaceCacheService)
  private readonly workspaceCacheService: WorkspaceCacheService;

  @Inject(RecordAccessPolicyService)
  private readonly recordAccessPolicyService: RecordAccessPolicyService;

  @Inject(RecordShareStorageService)
  private readonly recordShareStorageService: RecordShareStorageService;

  @Inject(WorkspaceOrmManager)
  private readonly workspaceOrmManager: WorkspaceOrmManager;

  async find(args: DirectMessageAccessArgs) {
    const pair = await this.getPair(args);
    const thread = await this.threadRepository.findOne(args.workspaceId, {
      where: pair,
    });

    if (!isDefined(thread)) {
      return null;
    }

    try {
      return await this.sharingService.getReadableThread({
        workspaceId: args.workspaceId,
        workspaceMemberId: args.workspaceMemberId,
        threadId: thread.id,
      });
    } catch (error) {
      if (
        error instanceof AiException &&
        error.code === AiExceptionCode.THREAD_NOT_FOUND
      ) {
        return null;
      }

      throw error;
    }
  }

  async prepareForSend(args: DirectMessageAccessArgs): Promise<string> {
    const pair = await this.getPair(args);
    const memberIds = [
      pair.directMessageFirstWorkspaceMemberId,
      pair.directMessageSecondWorkspaceMemberId,
    ];
    const authContext = await this.sharingService.getAuthContext(args);

    for (const workspaceMemberId of memberIds) {
      await this.sharingService.getAuthContext({
        workspaceId: args.workspaceId,
        workspaceMemberId,
      });
    }

    const existingThread = await this.threadRepository.findOne(
      args.workspaceId,
      { where: pair, select: ['id'] },
    );

    if (!isDefined(existingThread)) {
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager
            .getRepositoryWithContextPermissions('agentChatThread')
            .validateWriteIsPermitted({
              operationType: 'insert',
              columnsToReturn: ['id'],
              updatedColumns: [],
            }),
        authContext,
      );
    }

    const threadId = await this.identityService.getOrCreate({
      workspaceId: args.workspaceId,
      firstWorkspaceMemberId: args.workspaceMemberId,
      secondWorkspaceMemberId: args.peerWorkspaceMemberId,
    });
    const { flatObjectMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(args.workspaceId, [
        'flatObjectMetadataMaps',
      ]);
    const flatObjectMetadata =
      findAgentChatFlatObjectMetadata(
        flatObjectMetadataMaps,
        'agentChatThread',
      ) ?? throwAgentChatThreadNotFound();

    for (const workspaceMemberId of memberIds) {
      for (const operationType of ['select', 'update'] as const) {
        const hasAccess =
          await this.recordAccessPolicyService.hasAccessToRecords({
            principals: {
              workspaceId: args.workspaceId,
              mainPrincipal: { workspaceMemberId },
              applicationPrincipal: { isCustomApp: true },
            },
            flatObjectMetadata,
            recordIds: [threadId],
            operationType,
            hypotheticalRecordShareAccessLevel: RecordShareAccessLevel.FULL,
          });

        if (!hasAccess) {
          throwAgentChatThreadNotFound();
        }
      }
    }

    await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager.runInWorkspaceTransaction((transactionScope) =>
          this.recordShareStorageService.insertMany({
            workspaceId: args.workspaceId,
            transactionScope,
            recordShares: memberIds.map((workspaceMemberId) => ({
              recordId: threadId,
              objectMetadataId: flatObjectMetadata.id,
              principalId: workspaceMemberId,
              principalType: RecordSharePrincipalType.WORKSPACE_MEMBER,
              accessLevel: RecordShareAccessLevel.FULL,
              rowCause: RecordShareRowCause.OWNER,
              sourceId: threadId,
            })),
          }),
        ),
      buildSystemAuthContext(args.workspaceId),
      { lite: true },
    );

    await this.sharingService.getThreadWithAccess({
      workspaceId: args.workspaceId,
      workspaceMemberId: args.workspaceMemberId,
      threadId,
      operationType: 'update',
    });

    return threadId;
  }

  async resolveMessageRecipientIds({
    workspaceId,
    workspaceMemberId,
    thread,
    channelId,
    recipientWorkspaceMemberIds,
    mentionedWorkspaceMemberIds,
  }: {
    workspaceId: string;
    workspaceMemberId: string;
    thread: AgentChatThreadWorkspaceEntity;
    channelId?: string | null;
    recipientWorkspaceMemberIds: string[];
    mentionedWorkspaceMemberIds: string[];
  }): Promise<string[] | undefined> {
    if (thread.conversationType !== 'DIRECT_MESSAGE') {
      return undefined;
    }

    const peerWorkspaceMemberId = getAgentChatDirectMessagePeerOrThrow({
      thread,
      workspaceMemberId,
    });

    await this.getPair({
      workspaceId,
      workspaceMemberId,
      peerWorkspaceMemberId,
    });

    const hasOutsider = [
      ...recipientWorkspaceMemberIds,
      ...mentionedWorkspaceMemberIds,
    ].some(
      (memberId) =>
        ![workspaceMemberId, peerWorkspaceMemberId].includes(memberId),
    );

    if (isDefined(channelId) || isDefined(thread.channelId) || hasOutsider) {
      throw new AiException(
        'Direct messages require exactly their two workspace members and no channel',
        AiExceptionCode.INVALID_AGENT_INPUT,
      );
    }

    await this.sharingService.getAuthContext({
      workspaceId,
      workspaceMemberId: peerWorkspaceMemberId,
    });

    return [peerWorkspaceMemberId];
  }

  private async getPair({
    workspaceId,
    workspaceMemberId,
    peerWorkspaceMemberId,
  }: DirectMessageAccessArgs) {
    const { featureFlagsMap } = await this.workspaceCacheService.getOrRecompute(
      workspaceId,
      ['featureFlagsMap'],
    );

    if (
      !featureFlagsMap[FeatureFlagKey.IS_AI_CHAT_INBOX_ENABLED] ||
      !featureFlagsMap[
        FeatureFlagKey.IS_AGENT_CHAT_DIRECT_MESSAGE_IDENTITY_ENABLED
      ]
    ) {
      throw new AiException(
        'Direct messages are not available in this workspace',
        AiExceptionCode.CHAT_UPGRADE_IN_PROGRESS,
      );
    }

    return normalizeAgentChatDirectMessagePairOrThrow({
      firstWorkspaceMemberId: workspaceMemberId,
      secondWorkspaceMemberId: peerWorkspaceMemberId,
    });
  }
}
