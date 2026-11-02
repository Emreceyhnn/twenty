import { parseCanonicalTipTapJsonDocument } from 'twenty-shared/utils';
import { serializeJsonContentAsAdvancedTextEditorDocument } from '@/advanced-text-editor/utils/serializeJsonContentAsAdvancedTextEditorDocument';

export const mergeAgentChatDrafts = ({
  firstDraft,
  secondDraft,
}: {
  firstDraft: string;
  secondDraft: string;
}) => {
  if (firstDraft === '') {
    return secondDraft;
  }

  if (secondDraft === '') {
    return firstDraft;
  }

  return serializeJsonContentAsAdvancedTextEditorDocument({
    type: 'doc',
    content: [
      ...(parseCanonicalTipTapJsonDocument(firstDraft)?.content ?? []),
      ...(parseCanonicalTipTapJsonDocument(secondDraft)?.content ?? []),
    ],
  });
};
