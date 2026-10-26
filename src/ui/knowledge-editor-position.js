import { D, S } from '../core/store.js';

let scope;
let positions = new Map();
function position() {
  const next = JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);
  if (scope !== next) {
    scope = next;
    positions = new Map();
  }
  const id = document.querySelector('#knowledge-body')?.dataset.id;
  if (!id) return null;
  if (!positions.has(id)) positions.set(id, { source: 0, preview: 0, cursor: [0, 0, 'none'], inputScroll: 0 });
  if (positions.size > 20) positions.delete(positions.keys().next().value);
  return positions.get(id);
}
export function captureKnowledgeEditorPosition() {
  const value = position();
  const input = document.querySelector('#knowledge-body');
  if (!value || !input) return;
  const pane = document.querySelector('.knowledge-editor')?.dataset.pane || 'source';
  value[pane] = document.querySelector('.knowledge-drawer-body')?.scrollTop || 0;
  if (input.offsetParent !== null) {
    value.cursor = [input.selectionStart, input.selectionEnd, input.selectionDirection];
    value.inputScroll = input.scrollTop;
  }
}
export function restoreKnowledgeEditorPosition(pane) {
  const value = position();
  if (!value) return;
  const input = document.querySelector('#knowledge-body');
  if (pane === 'source' && input) {
    (input.disabled ? document.getElementById('knowledge-pane-source') : input)?.focus({ preventScroll: true });
    input.setSelectionRange(...value.cursor);
    input.scrollTop = value.inputScroll;
  } else document.querySelector('[data-a="setKnowledgeEditorPane"][data-pane="preview"]')?.focus({ preventScroll: true });
  document.querySelector('.knowledge-drawer-body')?.scrollTo(0, value[pane]);
}
