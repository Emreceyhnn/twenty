import { Inject, Injectable, Logger } from '@nestjs/common';

import { doNotTranslate } from 'twenty-shared/i18n';
import { isDefined } from 'twenty-shared/utils';

import { AgentChatSharingService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-sharing.service';
import { AgentChatThreadParticipantService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-thread-participant.service';
import { AgentChatThreadRecordEventService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-thread-record-event.service';
import { AgentChatThreadService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat-thread.service';
import { type AgentChatAssistantParticipationArgs } from 'src/engine/metadata-modules/ai/ai-chat/types/agent-chat-assistant-participation-args.type';
import { type AgentChatMessageParticipationResult } from 'src/engine/metadata-modules/ai/ai-chat/types/agent-chat-message-participation-result.type';
import { type AgentChatThreadAccessArgs } from 'src/engine/metadata-modules/ai/ai-chat/types/agent-chat-thread-access-args.type';
import { getAgentChatDirectMessagePeerOrThrow } from 'src/engine/metadata-modules/ai/ai-chat/utils/get-agent-chat-direct-message-peer-or-throw.util';
import { formatErrorWithCause } from 'src/engine/metadata-modules/ai/ai-chat/utils/format-error-with-cause.util';
import { AgentConversationWriterService } from 'src/engine/metadata-modules/ai/ai-history/services/agent-conversation-writer.service';
import { type AgentHistoryTransactionScope } from 'src/engine/metadata-modules/ai/ai-history/types/agent-history-transaction-scope.type';
import { type WorkspaceTransactionScope } from 'src/engine/twenty-orm/types/workspace-transaction-scope.type';

@Injectable()
export class AgentChatParticipationService {
  private readonly logger = new Logger(AgentChatParticipationService.name);

  @Inject(AgentChatThreadRecordEventService)
  private readonly threadRecordEventService: AgentChatThreadRecordEventService;

  constructor(
    private readonly threadService: AgentChatThreadService,
    private readonly sharingService: AgentChatSharingService,
    private readonly participantService: AgentChatThreadParticipantService,
    private readonly conversationWriterService: AgentConversationWriterService,
  ) {}

  async persistMessage<TSavedMessage extends { id: string }>({
    participation,
    persistMessage,
    ...args
  }: AgentChatThreadAccessArgs & {
    participation?: AgentChatAssistantParticipationArgs;
    persistMessage: (
      scope: AgentHistoryTransactionScope,
    ) => Promise<TSavedMessage>;
  }): Promise<TSavedMessage & AgentChatMessageParticipationResult> {
    const thread = await this.threadService.getWritableThread(args);
    const peerWorkspaceMemberId =
      thread.conversationType === 'DIRECT_MESSAGE'
        ? getAgentChatDirectMessagePeerOrThrow({
            thread,
            workspaceMemberId: args.workspaceMemberId,
          })
        : undefined;
    const effectiveParticipation = isDefined(peerWorkspaceMemberId)
      ? {
          ...participation,
          recipientWorkspaceMemberIds: [peerWorkspaceMemberId],
        }
      : participation;
    const authContext = await this.sharingService.getAuthContext(args);

    return this.conversationWriterService.runInTransaction({
      workspaceId: args.workspaceId,
      authContext,
      work: async (scope) => {
        await this.sharingService.lockThreadForWriteInTransaction({
          workspaceId: args.workspaceId,
          threadId: args.threadId,
          transactionScope: scope,
        });

        await this.participantService.resolveMentionInTransaction({
          ...args,
          scope,
        });

        const appliedParticipation = isDefined(effectiveParticipation)
          ? await this.threadService.applyAssistantParticipation({
              ...args,
              ...effectiveParticipation,
              transactionScope: scope,
            })
          : undefined;

        const savedMessage = await persistMessage(scope);
        const delivery = isDefined(effectiveParticipation)
          ? await this.deliverParticipants({
              ...args,
              ...effectiveParticipation,
              peerWorkspaceMemberId,
              messageId: savedMessage.id,
              isInitialMessage: appliedParticipation?.isInitialMessage ?? false,
              scope,
            })
          : {
              mentionedParticipantWorkspaceMemberIds: [],
              recipientParticipantWorkspaceMemberIds: [],
            };

        return { ...savedMessage, ...delivery };
      },
    });
  }

  private async deliverParticipants({
    scope,
    isInitialMessage,
    messageId,
    recipientWorkspaceMemberIds = [],
    mentionedWorkspaceMemberIds = [],
    peerWorkspaceMemberId,
    ...args
  }: AgentChatThreadAccessArgs &
    AgentChatAssistantParticipationArgs & {
      scope: AgentHistoryTransactionScope;
      isInitialMessage: boolean;
      messageId: string;
      peerWorkspaceMemberId?: string;
    }): Promise<AgentChatMessageParticipationResult> {
    if (isDefined(peerWorkspaceMemberId)) {
      if (isInitialMessage) {
        const lastActivityAt = new Date().toISOString();

        await scope.update(
          'agentChatThread',
          { id: args.threadId },
          {
            lastActivityAt,
            lastMessageSenderWorkspaceMemberId: args.workspaceMemberId,
            writerWorkspaceMemberIds: [
              args.workspaceMemberId,
              peerWorkspaceMemberId,
            ],
          },
        );
        await this.participantService.moveMembersToInbox({
          ...args,
          participantWorkspaceMemberIds: [
            args.workspaceMemberId,
            peerWorkspaceMemberId,
          ],
          isMention: false,
          shouldIncludeSender: true,
          senderLastReadAt: lastActivityAt,
          transactionScope: scope,
        });
        scope.afterCommit(() =>
          this.threadRecordEventService.emitThreadCreated({
            workspaceId: args.workspaceId,
            threadId: args.threadId,
          }),
        );
      }

      const mentionedParticipantWorkspaceMemberIds =
        await this.threadService.addMentionedParticipants({
          ...args,
          mentionedWorkspaceMemberIds,
          transactionScope: scope,
        });

      return {
        mentionedParticipantWorkspaceMemberIds,
        recipientParticipantWorkspaceMemberIds: isInitialMessage
          ? [peerWorkspaceMemberId]
          : [],
      };
    }

    const mentionedParticipantWorkspaceMemberIds = await this.deliverToInbox({
      ...args,
      scope,
      messageId,
      deliver: (transactionScope) =>
        this.threadService.addMentionedParticipants({
          ...args,
          mentionedWorkspaceMemberIds,
          transactionScope,
        }),
    });
    const recipientParticipantWorkspaceMemberIds = isInitialMessage
      ? await this.deliverToInbox({
          ...args,
          scope,
          messageId,
          deliver: (transactionScope) =>
            this.threadService.deliverToParticipants({
              ...args,
              participantWorkspaceMemberIds: recipientWorkspaceMemberIds,
              transactionScope,
            }),
        })
      : [];

    return {
      mentionedParticipantWorkspaceMemberIds,
      recipientParticipantWorkspaceMemberIds,
    };
  }

  private async deliverToInbox({
    scope,
    deliver,
    messageId,
    ...args
  }: AgentChatThreadAccessArgs & {
    scope: WorkspaceTransactionScope;
    messageId: string;
    deliver: (transactionScope: WorkspaceTransactionScope) => Promise<string[]>;
  }): Promise<string[]> {
    const afterCommitCallbacks: (() => void | Promise<void>)[] = [];
    const deliveryScope: WorkspaceTransactionScope = {
      ...scope,
      afterCommit: (callback) => afterCommitCallbacks.push(callback),
    };

    await scope.executeRawQuery('SAVEPOINT agent_chat_participant_delivery');

    try {
      const participantWorkspaceMemberIds = await deliver(deliveryScope);

      await scope.executeRawQuery(
        'RELEASE SAVEPOINT agent_chat_participant_delivery',
      );

      for (const callback of afterCommitCallbacks) {
        scope.afterCommit(callback);
      }

      return participantWorkspaceMemberIds;
    } catch (error) {
      await scope.executeRawQuery(
        'ROLLBACK TO SAVEPOINT agent_chat_participant_delivery',
      );
      await scope.executeRawQuery(
        'RELEASE SAVEPOINT agent_chat_participant_delivery',
      );
      this.logger.warn(
        doNotTranslate(
          `Could not apply participation for chat message ${messageId} in thread ${args.threadId} of workspace ${args.workspaceId}: ${formatErrorWithCause(error)}`,
        ),
      );

      return [];
    }
  }
}
