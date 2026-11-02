import { ALL_METADATA_NAME } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { getApplicationSubAllFlatEntityMaps } from 'src/engine/core-modules/application/application-manifest/utils/get-application-sub-all-flat-entity-maps.util';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { type AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';

export const buildApplicationUninstallOperations = ({
  applicationId,
  applicationUniversalIdentifier,
  fromAllFlatEntityMaps,
  shouldKeepAgentChatChannels,
}: {
  applicationId: string;
  applicationUniversalIdentifier: string;
  fromAllFlatEntityMaps: AllFlatEntityMaps;
  shouldKeepAgentChatChannels: boolean;
}): AllFlatEntityOperationRecordByMetadataName => {
  const applicationFlatEntityMaps = getApplicationSubAllFlatEntityMaps({
    applicationIds: [applicationId],
    fromAllFlatEntityMaps,
  });
  const retainedChannels = Object.values(
    applicationFlatEntityMaps.flatAgentChatChannelMaps.byUniversalIdentifier,
  )
    .filter(isDefined)
    .filter(
      (channel) =>
        shouldKeepAgentChatChannels ||
        channel.retainedApplicationUniversalIdentifier ===
          applicationUniversalIdentifier,
    );
  const retainedChannelIds = new Set(retainedChannels.map(({ id }) => id));
  const retainedChannelUniversalIdentifiers = new Set(
    retainedChannels.map(({ universalIdentifier }) => universalIdentifier),
  );
  const applicationRoleIds = new Set(
    Object.values(applicationFlatEntityMaps.flatRoleMaps.byUniversalIdentifier)
      .filter(isDefined)
      .map(({ id }) => id),
  );
  const operations: AllFlatEntityOperationRecordByMetadataName =
    Object.fromEntries(
      Object.values(ALL_METADATA_NAME).map((metadataName) => [
        metadataName,
        {
          flatEntityToCreate: {},
          flatEntityToUpdate: {},
          flatEntityToDelete:
            applicationFlatEntityMaps[
              getMetadataFlatEntityMapsKey(metadataName)
            ].byUniversalIdentifier,
        },
      ]),
    );

  operations.agentChatChannel = {
    flatEntityToCreate: {},
    flatEntityToUpdate: {},
    flatEntityToDelete: Object.fromEntries(
      Object.entries(
        applicationFlatEntityMaps.flatAgentChatChannelMaps
          .byUniversalIdentifier,
      ).filter(
        ([universalIdentifier]) =>
          !retainedChannelUniversalIdentifiers.has(universalIdentifier),
      ),
    ),
  };
  operations.agentChatChannelRole = {
    flatEntityToCreate: {},
    flatEntityToUpdate: {},
    flatEntityToDelete: Object.fromEntries(
      Object.entries(
        applicationFlatEntityMaps.flatAgentChatChannelRoleMaps
          .byUniversalIdentifier,
      ).filter(([, channelRole]) => {
        if (!isDefined(channelRole)) {
          return false;
        }

        const isRetainedChannelRole =
          retainedChannelIds.has(channelRole.channelId) &&
          !applicationRoleIds.has(channelRole.roleId);

        return !isRetainedChannelRole;
      }),
    ),
  };

  return operations;
};
