import { ApplicationSyncService } from 'src/engine/core-modules/application/application-manifest/application-sync.service';
import { fromRoleManifestToUniversalFlatRole } from 'src/engine/core-modules/application/application-manifest/converters/from-role-manifest-to-universal-flat-role.util';
import { type FlatAgentChatChannelRole } from 'src/engine/metadata-modules/flat-agent-chat-channel-role/types/flat-agent-chat-channel-role.type';
import { type FlatAgentChatChannel } from 'src/engine/metadata-modules/flat-agent-chat-channel/types/flat-agent-chat-channel.type';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { EMPTY_ORCHESTRATOR_FAILURE_REPORT } from 'src/engine/workspace-manager/workspace-migration/constant/empty-orchestrator-failure-report.constant';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';

type ApplicationSyncDependencies = ConstructorParameters<
  typeof ApplicationSyncService
>;
type RunUninstallMigration =
  ApplicationSyncDependencies[3]['validateBuildAndRunWorkspaceMigrationFromRecord'];

const WORKSPACE_ID = 'workspace-id';
const APPLICATION_ID = 'application-id';
const APPLICATION_UNIVERSAL_IDENTIFIER = 'application-universal-identifier';
const EXTERNAL_APPLICATION_ID = 'external-application-id';
const NOW = '2026-11-02T00:00:00.000Z';
const SYNCABLE = {
  workspaceId: WORKSPACE_ID,
  applicationId: APPLICATION_ID,
  applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  createdAt: NOW,
  updatedAt: NOW,
};

const buildRole = ({
  id,
  applicationId,
}: {
  id: string;
  applicationId: string;
}): FlatRole => ({
  ...fromRoleManifestToUniversalFlatRole({
    roleManifest: { universalIdentifier: id, label: id },
    applicationUniversalIdentifier:
      applicationId === APPLICATION_ID
        ? APPLICATION_UNIVERSAL_IDENTIFIER
        : 'external-application-universal-identifier',
    now: NOW,
  }),
  id,
  workspaceId: WORKSPACE_ID,
  applicationId,
  roleTargetIds: [],
  objectPermissionIds: [],
  rolePermissionFlagIds: [],
  fieldPermissionIds: [],
  rowLevelPermissionPredicateIds: [],
  rowLevelPermissionPredicateGroupIds: [],
  agentChatChannelRoleIds: [],
});

const APPLICATION_ROLE = buildRole({
  id: 'application-role-id',
  applicationId: APPLICATION_ID,
});
const EXTERNAL_ROLE = buildRole({
  id: 'external-role-id',
  applicationId: EXTERNAL_APPLICATION_ID,
});
const FRESH_CHANNEL: FlatAgentChatChannel = {
  ...SYNCABLE,
  id: 'fresh-channel-id',
  universalIdentifier: 'fresh-channel-universal-identifier',
  name: 'Fresh channel',
  icon: null,
  color: null,
  position: 1,
  retainedApplicationId: null,
  retainedApplicationUniversalIdentifier: null,
  channelRoleIds: ['application-channel-role-id', 'external-channel-role-id'],
  channelRoleUniversalIdentifiers: [
    'application-channel-role-universal-identifier',
    'external-channel-role-universal-identifier',
  ],
  navigationMenuItemIds: [],
  navigationMenuItemUniversalIdentifiers: [],
};
const RECLAIMED_CHANNEL: FlatAgentChatChannel = {
  ...FRESH_CHANNEL,
  id: 'reclaimed-channel-id',
  universalIdentifier: 'reclaimed-channel-universal-identifier',
  retainedApplicationId: 'previous-installation-id',
  retainedApplicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  channelRoleIds: [],
  channelRoleUniversalIdentifiers: [],
};
const APPLICATION_CHANNEL_ROLE: FlatAgentChatChannelRole = {
  ...SYNCABLE,
  id: 'application-channel-role-id',
  universalIdentifier: 'application-channel-role-universal-identifier',
  channelId: FRESH_CHANNEL.id,
  channelUniversalIdentifier: FRESH_CHANNEL.universalIdentifier,
  roleId: APPLICATION_ROLE.id,
  roleUniversalIdentifier: APPLICATION_ROLE.universalIdentifier,
};
const EXTERNAL_CHANNEL_ROLE: FlatAgentChatChannelRole = {
  ...APPLICATION_CHANNEL_ROLE,
  id: 'external-channel-role-id',
  universalIdentifier: 'external-channel-role-universal-identifier',
  roleId: EXTERNAL_ROLE.id,
  roleUniversalIdentifier: EXTERNAL_ROLE.universalIdentifier,
};

const buildFlatEntityMaps = () => {
  const maps = createEmptyAllFlatEntityMaps();

  for (const channel of [FRESH_CHANNEL, RECLAIMED_CHANNEL]) {
    maps.flatAgentChatChannelMaps = addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: channel,
      flatEntityMaps: maps.flatAgentChatChannelMaps,
    });
  }

  for (const channelRole of [APPLICATION_CHANNEL_ROLE, EXTERNAL_CHANNEL_ROLE]) {
    maps.flatAgentChatChannelRoleMaps = addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: channelRole,
      flatEntityMaps: maps.flatAgentChatChannelRoleMaps,
    });
  }

  for (const role of [APPLICATION_ROLE, EXTERNAL_ROLE]) {
    maps.flatRoleMaps = addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: role,
      flatEntityMaps: maps.flatRoleMaps,
    });
  }

  return maps;
};

describe('ApplicationSyncService.uninstallApplication', () => {
  const applicationService = {
    findOneApplicationWithRelationsOrThrow: jest.fn(),
    delete: jest.fn(),
  };
  const runMigration = jest.fn<
    ReturnType<RunUninstallMigration>,
    Parameters<RunUninstallMigration>
  >();
  const workspaceCacheService = { getOrRecompute: jest.fn() };
  const transferChannels = jest.fn();
  const service = new ApplicationSyncService(
    applicationService as unknown as ApplicationSyncDependencies[0],
    {} as ApplicationSyncDependencies[1],
    {} as ApplicationSyncDependencies[2],
    {
      validateBuildAndRunWorkspaceMigrationFromRecord: runMigration,
    } as unknown as ApplicationSyncDependencies[3],
    workspaceCacheService as unknown as ApplicationSyncDependencies[4],
    {} as ApplicationSyncDependencies[5],
    {} as ApplicationSyncDependencies[6],
    {
      getCurrentDriver: () => ({
        deleteApplicationResources: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as ApplicationSyncDependencies[7],
    {} as ApplicationSyncDependencies[8],
    {
      transferApplicationChannelsToWorkspace: transferChannels,
    } as unknown as ApplicationSyncDependencies[9],
  );
  const uninstall = (shouldKeepAgentChatChannels = true) =>
    service.uninstallApplication({
      workspaceId: WORKSPACE_ID,
      applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
      shouldRunUninstallHook: false,
      shouldKeepAgentChatChannels,
      progressReporter: {
        reportStepCompleted: jest.fn().mockResolvedValue(undefined),
      },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    applicationService.findOneApplicationWithRelationsOrThrow.mockResolvedValue(
      {
        id: APPLICATION_ID,
        universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        canBeUninstalled: true,
      },
    );
    applicationService.delete.mockResolvedValue(undefined);
    workspaceCacheService.getOrRecompute.mockResolvedValue(
      buildFlatEntityMaps(),
    );
    transferChannels.mockResolvedValue(undefined);
    runMigration.mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        actions: [],
      },
      hasSchemaMetadataChanged: false,
    });
  });

  it('keeps channel ownership and access when running the uninstall migration fails', async () => {
    const error = new Error('WORKSPACE_SCHEMA_DDL_LOCKED');

    runMigration.mockRejectedValueOnce(error);

    await expect(uninstall()).rejects.toBe(error);

    expect(transferChannels).not.toHaveBeenCalled();
    expect(applicationService.delete).not.toHaveBeenCalled();
  });

  it('keeps channel ownership and access when the uninstall migration is invalid', async () => {
    runMigration.mockResolvedValueOnce({
      status: 'fail',
      report: EMPTY_ORCHESTRATOR_FAILURE_REPORT(),
    });

    await expect(uninstall()).rejects.toBeInstanceOf(
      WorkspaceMigrationBuilderException,
    );

    expect(transferChannels).not.toHaveBeenCalled();
    expect(applicationService.delete).not.toHaveBeenCalled();
  });

  it('preserves retained channels and external role access before transferring ownership', async () => {
    await uninstall();

    const operations =
      runMigration.mock.calls[0][0].allFlatEntityOperationRecordByMetadataName;

    expect(operations.agentChatChannel?.flatEntityToDelete).toEqual({});
    expect(operations.agentChatChannelRole?.flatEntityToDelete).toEqual({
      [APPLICATION_CHANNEL_ROLE.universalIdentifier]: APPLICATION_CHANNEL_ROLE,
    });
    expect(runMigration.mock.invocationCallOrder[0]).toBeLessThan(
      transferChannels.mock.invocationCallOrder[0],
    );
    expect(transferChannels.mock.invocationCallOrder[0]).toBeLessThan(
      applicationService.delete.mock.invocationCallOrder[0],
    );
  });

  it('deletes fresh channels and preserves reclaimed channels during failed-install rollback', async () => {
    await uninstall(false);

    const operations =
      runMigration.mock.calls[0][0].allFlatEntityOperationRecordByMetadataName;

    expect(operations.agentChatChannel?.flatEntityToDelete).toEqual({
      [FRESH_CHANNEL.universalIdentifier]: FRESH_CHANNEL,
    });
    expect(operations.agentChatChannelRole?.flatEntityToDelete).toEqual({
      [APPLICATION_CHANNEL_ROLE.universalIdentifier]: APPLICATION_CHANNEL_ROLE,
      [EXTERNAL_CHANNEL_ROLE.universalIdentifier]: EXTERNAL_CHANNEL_ROLE,
    });
  });
});
