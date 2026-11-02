import { FieldActorSource } from 'twenty-shared/types';
import { In, LessThan } from 'typeorm';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { AgentRunsService } from 'src/engine/metadata-modules/ai/ai-agent-runs/services/agent-runs.service';
import { AgentTurnStatus } from 'src/engine/metadata-modules/ai/ai-history/enums/agent-turn-status.enum';

const AUTH_CONTEXT = {
  type: 'user',
  workspace: { id: 'workspace-id' },
  workspaceMemberId: 'member-id',
} as UserWorkspaceAuthContext;

const buildTurn = (id: string) => ({
  id,
  threadId: `thread-of-${id}`,
  status: AgentTurnStatus.COMPLETED,
  error: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  startedAt: null,
  endedAt: null,
  modelId: null,
  inputTokens: null,
  outputTokens: null,
  inputCredits: null,
  outputCredits: null,
  createdBy: {
    source: FieldActorSource.APPLICATION,
    name: 'App',
    workspaceMemberId: null,
    context: {},
  },
  thread: { title: null },
});

const buildService = ({
  turns,
  messages,
  parts,
  readableDirectMessageThreadIds = [],
}: {
  turns: unknown[];
  messages: unknown[];
  parts: unknown[];
  readableDirectMessageThreadIds?: string[];
}) => {
  const turnRepository = { find: jest.fn().mockResolvedValue(turns) };
  const messageRepository = { find: jest.fn().mockResolvedValue(messages) };
  const messagePartRepository = { find: jest.fn().mockResolvedValue(parts) };
  const threadAccessRepository = {
    findRecordIdsAllowedForOperation: jest.fn(
      async ({ recordIds }: { recordIds: string[] }) =>
        recordIds.filter((recordId) =>
          readableDirectMessageThreadIds.includes(recordId),
        ),
    ),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (work: () => Promise<unknown>) =>
      work(),
    ),
    getRepositoryWithContextPermissions: jest
      .fn()
      .mockReturnValue(threadAccessRepository),
  };

  return {
    service: new AgentRunsService(
      turnRepository as never,
      messageRepository as never,
      messagePartRepository as never,
      workspaceOrmManager as never,
    ),
    turnRepository,
    messageRepository,
    messagePartRepository,
    threadAccessRepository,
    workspaceOrmManager,
  };
};

describe('AgentRunsService', () => {
  it('gives each run the messages and parts of its own turn', async () => {
    const { service, messageRepository, messagePartRepository } = buildService({
      turns: [buildTurn('turn-a'), buildTurn('turn-b')],
      messages: [
        {
          id: 'message-a',
          turnId: 'turn-a',
          role: 'user',
          createdAt: '2026-10-05T10:00:00.000Z',
        },
        {
          id: 'message-b',
          turnId: 'turn-b',
          role: 'user',
          createdAt: '2026-10-05T10:00:00.000Z',
        },
      ],
      parts: [
        {
          id: 'part-a',
          messageId: 'message-a',
          orderIndex: 0,
          type: 'text',
          textContent: 'First input',
          toolName: null,
        },
        {
          id: 'part-b',
          messageId: 'message-b',
          orderIndex: 0,
          type: 'text',
          textContent: 'Second input',
          toolName: null,
        },
      ],
    });

    const runs = await service.findAgentRuns({
      authContext: AUTH_CONTEXT,
      agentId: 'agent-id',
      limit: 10,
    });

    expect(runs.map((run) => run.input)).toEqual([
      'First input',
      'Second input',
    ]);
    expect(messageRepository.find).toHaveBeenCalledWith(
      'workspace-id',
      expect.objectContaining({ where: { turnId: In(['turn-a', 'turn-b']) } }),
    );
    const [partWorkspaceId, partQuery] =
      messagePartRepository.find.mock.calls[0];

    expect(partWorkspaceId).toBe('workspace-id');
    expect(partQuery.select).not.toContain('toolInput');
    expect(partQuery.select).not.toContain('toolOutput');
  });

  it('fills the limit after hidden DM runs without reading their messages', async () => {
    const directMessageThread = {
      title: 'Private DM',
      conversationType: 'DIRECT_MESSAGE',
      directMessageFirstWorkspaceMemberId: 'first-member-id',
      directMessageSecondWorkspaceMemberId: 'second-member-id',
    };
    const hiddenFirstTurn = {
      ...buildTurn('turn-z-hidden'),
      thread: directMessageThread,
    };
    const hiddenSecondTurn = {
      ...buildTurn('turn-y-hidden'),
      thread: directMessageThread,
    };
    const ordinaryTurn = buildTurn('turn-x-ordinary');
    const readableDirectMessageTurn = {
      ...buildTurn('turn-w-readable'),
      thread: directMessageThread,
    };
    const { service, turnRepository, messageRepository, workspaceOrmManager } =
      buildService({
        turns: [],
        messages: [],
        parts: [],
        readableDirectMessageThreadIds: [readableDirectMessageTurn.threadId],
      });

    turnRepository.find
      .mockResolvedValueOnce([hiddenFirstTurn, hiddenSecondTurn])
      .mockResolvedValueOnce([ordinaryTurn, readableDirectMessageTurn]);

    const runs = await service.findAgentRuns({
      authContext: AUTH_CONTEXT,
      agentId: 'agent-id',
      limit: 2,
    });

    expect(runs.map(({ id }) => id)).toEqual([
      ordinaryTurn.id,
      readableDirectMessageTurn.id,
    ]);
    expect(turnRepository.find).toHaveBeenCalledTimes(2);
    expect(turnRepository.find).toHaveBeenLastCalledWith(
      'workspace-id',
      expect.objectContaining({
        where: [
          {
            agentId: 'agent-id',
            createdAt: LessThan(hiddenSecondTurn.createdAt),
          },
          {
            agentId: 'agent-id',
            createdAt: hiddenSecondTurn.createdAt,
            id: LessThan(hiddenSecondTurn.id),
          },
        ],
      }),
    );
    expect(messageRepository.find).toHaveBeenCalledWith(
      'workspace-id',
      expect.objectContaining({
        where: { turnId: In([ordinaryTurn.id, readableDirectMessageTurn.id]) },
      }),
    );
    expect(workspaceOrmManager.executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      AUTH_CONTEXT,
    );
  });

  it('reads no messages when the agent has no runs', async () => {
    const { service, messageRepository, messagePartRepository } = buildService({
      turns: [],
      messages: [],
      parts: [],
    });

    expect(
      await service.findAgentRuns({
        authContext: AUTH_CONTEXT,
        agentId: 'agent-id',
        limit: 10,
      }),
    ).toEqual([]);
    expect(messageRepository.find).not.toHaveBeenCalled();
    expect(messagePartRepository.find).not.toHaveBeenCalled();
  });
});
