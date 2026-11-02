import { isNonEmptyArray } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { type AgentMessageWorkspaceEntity } from 'src/engine/metadata-modules/ai/ai-history/standard-objects/agent-message.workspace-entity';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';

export const findAgentChatMessageThreadIds = async ({
  repository,
  messageIds,
}: {
  repository: WorkspaceRepository<AgentMessageWorkspaceEntity>;
  messageIds: string[];
}): Promise<Map<string, string>> => {
  if (!isNonEmptyArray(messageIds)) {
    return new Map();
  }

  const messages = await repository.find({
    where: { id: In(messageIds) },
    select: { id: true, threadId: true },
    withDeleted: true,
  });

  return new Map(messages.map(({ id, threadId }) => [id, threadId]));
};
