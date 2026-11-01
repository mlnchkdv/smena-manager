import { whiteboardBounds } from '../shared/project-whiteboard.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { esc } from '../core/utils.js';

export function whiteboardMinimap(board, state) {
  if (!state.minimap || !board.nodes.length) return '';
  const b = whiteboardBounds(board),
    pad = Math.max(b.width, b.height) * 0.08;
  const view = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  return `<button class="whiteboard-minimap" data-a="whiteboardMinimap" data-box="${esc(JSON.stringify(view))}" aria-label="${T('Minimap. Arrow keys pan; Enter fits all cards.', 'Миникарта. Стрелки перемещают обзор; Enter показывает весь холст.')}" title="${T('Minimap', 'Миникарта')}"><svg viewBox="${view.x} ${view.y} ${view.width} ${view.height}" preserveAspectRatio="none" aria-hidden="true">${board.nodes
    .slice(0, 200)
    .map(n => `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" class="minimap-card"/>`)
    .join('')}<rect data-minimap-camera class="minimap-camera"/></svg></button>`;
}
export function refreshWhiteboardMinimap(state) {
  const viewport = document.querySelector('.whiteboard-viewport');
  const camera = viewport?.querySelector('[data-minimap-camera]');
  if (!camera) return;
  const rect = viewport.getBoundingClientRect();
  for (const [key, value] of Object.entries({
    x: -state.x / state.zoom,
    y: -state.y / state.zoom,
    width: rect.width / state.zoom,
    height: rect.height / state.zoom,
  }))
    camera.setAttribute(key, value);
}
