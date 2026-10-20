import { D } from '../core/store.js';
import { esc } from '../core/utils.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';
import { relationsPanel } from './relations.js';
import { folderTrail } from '../shared/knowledge-tools.js';
export function knowledgeContext(note) {
  const { outgoing, backlinks } = knowledgeRelations(D().knowledgeNotes, note);
  const row = item =>
    `<button class="btn btn-ghost knowledge-relation" data-a="openKnowledgeNote" data-id="${esc(item.id)}" translate="no">${esc(item.title)}</button>`;
  return `<section class="knowledge-preview-context" aria-label="Note context"><p class="hint" translate="no">${esc(
    folderTrail(note.folderId, D().knowledgeFolders)
      .map(folder => folder.name)
      .join(' / '),
  )}</p><div class="knowledge-context-tags">${(note.tags || []).map(tag => `<button class="knowledge-tag" data-a="filterKnowledgePreviewTag" data-tag="${esc(tag)}" translate="no">${esc(tag)}</button>`).join('')}</div>${outgoing.length ? `<h3>Linked notes</h3>${outgoing.map(ref => (ref.note ? row(ref.note) : `<span class="hint" translate="no">${esc(ref.title)}</span>`)).join('')}` : ''}${backlinks.length ? `<h3>Backlinks</h3>${backlinks.map(row).join('')}` : ''}${relationsPanel(`note:${note.id}`, true)}</section>`;
}
