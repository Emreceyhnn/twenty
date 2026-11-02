import { isCommandAllowedForDirectMessage } from '@/ai/utils/isCommandAllowedForDirectMessage';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { EngineComponentKey } from '~/generated-metadata/graphql';

describe('isCommandAllowedForDirectMessage', () => {
  it('keeps personal Inbox commands while blocking sharing and deletion in a mixed selection', () => {
    const context = {
      objectMetadataItem: {
        nameSingular: CoreObjectNameSingular.AgentChatThread,
      },
      selectedRecords: [
        { id: 'ordinary', conversationType: 'STANDARD' },
        { id: 'direct', conversationType: 'DIRECT_MESSAGE' },
      ],
    };

    expect(
      isCommandAllowedForDirectMessage({
        context,
        engineComponentKey: EngineComponentKey.SHARE_RECORD,
      }),
    ).toBe(false);
    expect(
      isCommandAllowedForDirectMessage({
        context,
        engineComponentKey: EngineComponentKey.DELETE_RECORDS,
      }),
    ).toBe(false);
    expect(
      isCommandAllowedForDirectMessage({
        context,
        engineComponentKey: EngineComponentKey.SNOOZE_AI_CHAT,
      }),
    ).toBe(true);
    expect(
      isCommandAllowedForDirectMessage({
        context: { ...context, selectedRecords: [context.selectedRecords[0]] },
        engineComponentKey: EngineComponentKey.SHARE_RECORD,
      }),
    ).toBe(true);
  });
});
