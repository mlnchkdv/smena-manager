import { S } from '../core/store.js';
import { esc } from '../core/utils.js';

export function knowledgeDisclosure(noteId, section) {
  const key = `${noteId}:${section}`;
  return `data-knowledge-disclosure="${esc(key)}" ${(S.ui.knowledgeOpenSections || []).includes(key) ? 'open' : ''}`;
}
function rememberDisclosure(element) {
  const key = element.dataset?.knowledgeDisclosure;
  if (!key || !element.isConnected) return;
  const open = new Set(S.ui.knowledgeOpenSections || []);
  element.open ? open.add(key) : open.delete(key);
  S.ui.knowledgeOpenSections = [...open].slice(-100);
}

// Native toggle events are queued. Read the live DOM before replacing it so a
// search response cannot outrun the latest open/close interaction.
export function captureKnowledgeDisclosures() {
  document.querySelectorAll('details[data-knowledge-disclosure]').forEach(rememberDisclosure);
}
document.addEventListener(
  'click',
  event => {
    const summary = event.target.closest?.('summary');
    const details = summary?.parentElement;
    if (!details?.matches('details[data-knowledge-disclosure]')) return;
    event.preventDefault();
    details.open = !details.open;
    rememberDisclosure(details);
  },
  true,
);
document.addEventListener(
  'toggle',
  event => {
    rememberDisclosure(event.target);
  },
  true,
);
