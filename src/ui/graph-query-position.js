import { D, S } from '../core/store.js';
let selection;
const scope = () => JSON.stringify([S.ui.currentUser?.id, D().ws.id || D().ws.url]);

// View buttons take focus before render. Keep the query caret without stealing
// focus back from the button, including subsequent background graph responses.
export function captureGraphQueryPosition() {
  const input = document.getElementById('graph-search');
  selection = input ? { scope: scope(), value: input.value, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection } : null;
}
export function restoreGraphQueryPosition() {
  const input = document.getElementById('graph-search');
  if (input && selection?.scope === scope() && input.value === selection.value) input.setSelectionRange(selection.start, selection.end, selection.direction);
}
