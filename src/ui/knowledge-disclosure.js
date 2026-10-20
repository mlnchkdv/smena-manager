import { S } from '../core/store.js';
import { esc } from '../core/utils.js';

export function knowledgeDisclosure(noteId, section) {
  const key = `${noteId}:${section}`;
  return `data-knowledge-disclosure="${esc(key)}" ${(S.ui.knowledgeOpenSections || []).includes(key) ? 'open' : ''}`;
}
document.addEventListener(
  'toggle',
  event => {
    const key = event.target.dataset?.knowledgeDisclosure;
    if (!key) return;
    const open = new Set(S.ui.knowledgeOpenSections || []);
    event.target.open ? open.add(key) : open.delete(key);
    S.ui.knowledgeOpenSections = [...open].slice(-100);
  },
  true,
);
