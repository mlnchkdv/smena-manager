import { whiteboardOf, validWhiteboard } from './project-whiteboard.js';
const label = value =>
  String(value || '')
    .replace(/[[\]|\r\n]/g, ' ')
    .trim()
    .slice(0, 160);
const html = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Copies are separate materials. The source card is never replaced or deleted.
export function whiteboardCopyDraft(document, nodeId, selection = '') {
  const board = whiteboardOf(document),
    node = board.nodes.find(node => node.id === nodeId);
  if (!document?.id || !validWhiteboard(board) || !node || !['text', 'shape'].includes(node.type)) return null;
  const selected = typeof selection === 'string' && selection.trim() && node.text.includes(selection) ? selection : '';
  const text = selected || node.text || node.title;
  if (!text.trim()) return null;
  return {
    title: (node.title || text.split('\n')[0]).slice(0, 120),
    text,
    source: { id: document.id, nodeId, title: label(document.name), card: label(node.title), base: JSON.stringify([node.title, node.text]) },
  };
}
export function whiteboardCopySourceCurrent(document, source) {
  if (document?.id !== source?.id) return false;
  const node = whiteboardOf(document).nodes.find(n => n.id === source.nodeId);
  return !!node && ['text', 'shape'].includes(node.type) && JSON.stringify([node.title, node.text]) === source.base;
}
export function whiteboardCopyMarkdown(draft) {
  return `${draft.text}\n\n[[whiteboard:${draft.source.id}|${label(draft.source.title) || 'Whiteboard'}]]${draft.source.card ? ' · ' + label(draft.source.card) : ''}`;
}
export function whiteboardCopyTaskHtml(text, source, slug) {
  const path = `/${encodeURIComponent(slug)}/whiteboard/${encodeURIComponent(source.id)}`;
  return `<p>${html(text)}</p><p><a href="${path}">${html(source.title || 'Whiteboard')}</a>${source.card ? ' · ' + html(source.card) : ''}</p>`;
}
