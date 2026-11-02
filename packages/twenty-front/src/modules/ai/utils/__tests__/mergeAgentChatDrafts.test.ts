import { serializePlainTextAsAdvancedTextEditorDocument } from '@/advanced-text-editor/utils/serializePlainTextAsAdvancedTextEditorDocument';
import { mergeAgentChatDrafts } from '@/ai/utils/mergeAgentChatDrafts';
import { tipTapDocumentToMarkdown } from 'twenty-shared/utils';

describe('mergeAgentChatDrafts', () => {
  it('preserves typing made while a send was pending when restoring the failed message', () => {
    const firstDraft =
      serializePlainTextAsAdvancedTextEditorDocument('First message');
    const secondDraft =
      serializePlainTextAsAdvancedTextEditorDocument('Next message');

    expect(
      tipTapDocumentToMarkdown(
        mergeAgentChatDrafts({ firstDraft, secondDraft }),
      ),
    ).toBe('First message\n\nNext message');
    expect(mergeAgentChatDrafts({ firstDraft, secondDraft: '' })).toBe(
      firstDraft,
    );
  });
});
