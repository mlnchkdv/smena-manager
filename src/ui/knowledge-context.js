import { folderTrail } from '../shared/knowledge-tools.js';
import { D, S } from '../core/store.js';
import { esc, uid } from '../core/utils.js';
import { relationsPanel } from './relations.js';
import { knowledgeRelations } from '../shared/knowledge-links.js';
import { unlinkedMentions } from '../shared/knowledge-context.js';
import { kc } from './knowledge-types.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { mutate } from './toast.js';
import { knowledgeEditBlocked } from './knowledge-save-status.js';
export function knowledgeContext(note) {
  const open = S.ui.knowledgeContextId === note.id;
  let body = '';
  if (open) {
    const refs = knowledgeRelations(D().knowledgeNotes, note);
    const related = [...refs.outgoing.filter(r => r.note).map(r => r.note), ...refs.backlinks];
    const snippets = [...new Map(related.map(n => [n.id, n])).values()]
      .slice(0, 8)
      .map(
        n =>
          `<button class="knowledge-context-result" data-a="goKnowledgeNote" data-id="${esc(n.id)}"><strong>${esc(n.title)}</strong><span>${esc(n.summary || n.formatted_markdown?.slice(0, 160) || '')}</span></button>`,
      )
      .join('');
    const mentions = unlinkedMentions(
      D().knowledgeNotes,
      note,
      related.map(n => n.id),
    )
      .map(
        n =>
          `<div class="knowledge-context-result"><button class="link" data-a="goKnowledgeNote" data-id="${esc(n.id)}">${esc(n.title)}</button><span>${esc(n.snippet)}</span>${S.ui.currentUser?.role !== 'viewer' ? `<button class="btn btn-ghost btn-sm" data-a="connectKnowledgeMention" data-from="${esc(note.id)}" data-to="${esc(n.id)}">${kc('Connect', 'Связать')}</button>` : ''}</div>`,
      )
      .join('');
    body = `<div translate="no">${snippets}<h4>${kc('Unlinked mentions', 'Упоминания без связи')}</h4>${mentions || `<p class="hint">${kc('No suggestions.', 'Нет предложений.')}</p>`}<p class="hint">${kc('Suggestions do not change any note until you connect them.', 'Предложения не меняют заметки без вашего действия.')}</p></div>`;
  }
  return `<section class="knowledge-preview-context"><p class="hint" translate="no">${esc(
    folderTrail(note.folderId, D().knowledgeFolders)
      .map(f => f.name)
      .join(' / '),
  )}</p><div class="knowledge-context-tags">${(note.tags || []).map(tag => `<button class="knowledge-tag" data-a="filterKnowledgePreviewTag" data-tag="${esc(tag)}" translate="no">${esc(tag)}</button>`).join('')}</div>${relationsPanel(`note:${note.id}`, true)}<section class="knowledge-context"><button class="btn btn-ghost btn-sm" data-a="toggleKnowledgeContext" data-id="${esc(note.id)}" aria-expanded="${open}" translate="no">${kc('Context and mentions', 'Контекст и упоминания')}</button>${body}</section></section>`;
}
A.toggleKnowledgeContext = el => {
  S.ui.knowledgeContextId = S.ui.knowledgeContextId === el.dataset.id ? null : el.dataset.id;
  render();
};
A.connectKnowledgeMention = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const ids = [el.dataset.from, el.dataset.to];
  if (!ids.every(id => D().knowledgeNotes.some(n => n.id === id))) return;
  mutate(() => {
    D().relations ||= [];
    const from = `note:${ids[0]}`,
      to = `note:${ids[1]}`;
    if (!D().relations.some(r => !r.deletedAt && r.from === from && r.to === to))
      D().relations.push({ id: uid('rel'), from, to, type: 'related', createdBy: D().me, createdAt: new Date().toISOString() });
  });
};
