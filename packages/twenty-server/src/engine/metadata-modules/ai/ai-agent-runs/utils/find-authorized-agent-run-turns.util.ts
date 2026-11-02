import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { LessThan } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type AgentHistoryRepository } from 'src/engine/metadata-modules/ai/ai-history/repositories/agent-history-repository';
import { type AgentTurnWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-turn.workspace-entity';
import { hasDirectMessageThreadIdentity } from 'src/engine/permissions/direct-message/utils/has-direct-message-thread-identity.util';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

export const findAuthorizedAgentRunTurns = async ({
  authContext,
  agentId,
  limit,
  turnRepository,
  workspaceOrmManager,
}: {
  authContext: WorkspaceAuthContext;
  agentId: string;
  limit: number;
  turnRepository: Pick<
    AgentHistoryRepository<AgentTurnWorkspaceEntity>,
    'find'
  >;
  workspaceOrmManager: Pick<
    WorkspaceOrmManager,
    'executeInWorkspaceContext' | 'getRepositoryWithContextPermissions'
  >;
}): Promise<AgentTurnWorkspaceEntity[]> => {
  const workspaceId = authContext.workspace.id;
  const authorizedTurns: AgentTurnWorkspaceEntity[] = [];
  let cursor: Pick<AgentTurnWorkspaceEntity, 'createdAt' | 'id'> | undefined;

  while (authorizedTurns.length < limit) {
    const turns = await turnRepository.find(workspaceId, {
      where: isDefined(cursor)
        ? [
            { agentId, createdAt: LessThan(cursor.createdAt) },
            {
              agentId,
              createdAt: cursor.createdAt,
              id: LessThan(cursor.id),
            },
          ]
        : { agentId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      relations: { thread: true },
    });

    if (!isNonEmptyArray(turns)) {
      return authorizedTurns;
    }

    const directMessageThreadIds = new Set(
      turns
        .filter(
          ({ thread }) =>
            !isDefined(thread) || hasDirectMessageThreadIdentity(thread),
        )
        .map(({ threadId }) => threadId),
    );
    const readableDirectMessageThreadIds = new Set(
      directMessageThreadIds.size > 0
        ? await workspaceOrmManager.executeInWorkspaceContext(
            () =>
              workspaceOrmManager
                .getRepositoryWithContextPermissions('agentChatThread')
                .findRecordIdsAllowedForOperation({
                  recordIds: [...directMessageThreadIds],
                  operationType: 'select',
                  withDeleted: true,
                }),
            authContext,
          )
        : [],
    );

    for (const turn of turns) {
      if (
        directMessageThreadIds.has(turn.threadId) &&
        !readableDirectMessageThreadIds.has(turn.threadId)
      ) {
        continue;
      }

      authorizedTurns.push(turn);

      if (authorizedTurns.length === limit) {
        return authorizedTurns;
      }
    }

    if (turns.length < limit) {
      return authorizedTurns;
    }

    cursor = turns[turns.length - 1];
  }

  return authorizedTurns;
};
