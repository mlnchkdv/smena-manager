import { resolveKnowledgeBlock } from '../shared/knowledge-block-references.js';
import { D } from '../core/store.js';
import { t } from '../core/i18n.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';
export const knowledgeMarkdownOptions = (note = {}) => ({
  plainText: note.sourceFormat === 'text',
  resolveBlock: (id, block) => resolveKnowledgeBlock(D().knowledgeNotes, id, block),
  embedUnavailableLabel: document.documentElement.lang === 'ru' ? 'Блок недоступен или образует цикл' : 'Block unavailable or recursive',
  unresolvedLabel: t('Unresolved wiki link'),
  imageLabel: t('Image'),
  openImageLabel: t('Open image'),
  unavailableImageLabel: t('Image source unavailable'),
});

export function knowledgeReadingHtml(note, source) {
  const wikiTargets = new Map(
    knowledgeRelations(D().knowledgeNotes, note)
      .outgoing.filter(ref => ref.note)
      .map(ref => [ref.title.toLocaleLowerCase('ru-RU'), ref.note.id]),
  );
  return renderKnowledgeMarkdown(source, { ...knowledgeMarkdownOptions(note), wikiTargets, sourceId: note.id });
}
