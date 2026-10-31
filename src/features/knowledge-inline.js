import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { uid } from '../core/utils.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { entityAllowed, resolveGraphEntity } from '../shared/relations.js';
import { graphOptions } from '../ui/relations.js';
import { insertMaterialLink } from '../shared/material-links.js';
import { mutate } from '../ui/toast.js';
import { knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
export function openInlinePicker(start, end) {
  const input = document.getElementById('knowledge-body');
  if (!input || input.disabled || knowledgeEditBlocked()) return;
  const id = input.dataset.id;
  openModal({
    type: 'relations',
    source: `note:${id}`,
    query: '',
    kind: '',
    relationType: 'source',
    inline: { id, start: start ?? input.selectionStart, end: end ?? input.selectionEnd, base: input.value },
  });
}
export function insertInlineTarget(modal, key) {
  const note = D().knowledgeNotes.find(n => n.id === modal.inline.id),
    options = graphOptions();
  const target = resolveGraphEntity(D(), key);
  if (
    !note ||
    !target ||
    knowledgeEditBlocked() ||
    !entityAllowed(D(), `note:${note.id}`, options, true) ||
    !entityAllowed(D(), key, options) ||
    note.formatted_markdown !== modal.inline.base
  )
    return;
  const result = insertMaterialLink(
    note.formatted_markdown,
    modal.inline.start,
    modal.inline.end,
    key,
    target.item.title || target.item.name || target.item.url,
  );
  if (
    mutate(() => {
      note.formatted_markdown = result.text;
      note.updatedAt = new Date().toISOString();
      note.updatedBy = D().me;
    })
  ) {
    closeModal();
    requestAnimationFrame(() => {
      const input = document.getElementById('knowledge-body');
      input?.focus();
      input?.setSelectionRange(result.cursor, result.cursor);
    });
  }
}
A.insertKnowledgeMaterial = () => openInlinePicker();
A.createInlineKnowledgeNote = () => {
  const m = S.ui.modals.at(-1),
    title = String(m?.query || '')
      .trim()
      .slice(0, 250);
  if (!m?.inline || !title || S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const id = uid('kn');
  if (
    mutate(() => {
      D().knowledgeNotes.unshift({ id, title, formatted_markdown: '', tags: [], folderId: null, updatedAt: new Date().toISOString(), updatedBy: D().me });
    })
  )
    insertInlineTarget(m, `note:${id}`);
};
let handling = false;
document.addEventListener('input', event => {
  const input = event.target;
  if (handling || input.id !== 'knowledge-body' || input.disabled || !input.value.slice(0, input.selectionStart).endsWith('[[')) return;
  handling = true;
  queueMicrotask(() => {
    openInlinePicker(input.selectionStart - 2, input.selectionStart);
    handling = false;
  });
});
