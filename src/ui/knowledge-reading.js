import { D } from '../core/store.js';
import { t } from '../core/i18n.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';

export function knowledgeReadingHtml(note, source) {
  const wikiTargets = new Map(
    knowledgeRelations(D().knowledgeNotes, note)
      .outgoing.filter(ref => ref.note)
      .map(ref => [ref.title.toLocaleLowerCase('ru-RU'), ref.note.id]),
  );
  return renderKnowledgeMarkdown(source, { wikiTargets, sourceId: note.id, unresolvedLabel: t('Unresolved wiki link') });
}
