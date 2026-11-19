import { ic } from '../core/icons.js';
import { esc } from '../core/utils.js';
import { whiteboardLabel, wbCount as C, wbText as T } from '../core/whiteboard-state.js';
import { whiteboardLayerUnits } from '../shared/whiteboard-selection.js';
import '../styles/whiteboard-layers-panel.css';

const icons = { material: 'file-text', shape: 'shapes', text: 'sticky-note', group: 'group', frame: 'square-dashed' };

export function whiteboardLayersPanel(board, state, editable) {
  const selected = new Set(state.selection);
  const rows = whiteboardLayerUnits(board).map(layer => {
    const node = layer.nodes[0];
    const label = esc(whiteboardLabel(node));
    const kind = layer.kind === 'group' ? T('Group', 'Группа') : layer.kind === 'frame' ? T('Frame', 'Рамка') : '';
    const details = [kind, layer.kind === 'group' && !layer.hidden ? C(layer.nodes.length, 'card') : '', layer.hidden ? T('Hidden', 'Скрыто') : '']
      .filter(Boolean)
      .join(' · ');
    const typeIcon = layer.kind === 'card' ? icons[node.type] : icons[layer.kind];
    const visibility = layer.hidden ? T('Show layer', 'Показать слой') : T('Hide layer', 'Скрыть слой');
    const positionLock = layer.locked ? T('Unlock position', 'Разблокировать положение') : T('Lock position', 'Зафиксировать положение');
    return `<li class="whiteboard-layer-row" data-layer-row="${esc(layer.id)}" data-layer-tier="${layer.kind === 'frame' ? 'frames' : 'cards'}" ${layer.hidden ? 'data-layer-hidden' : ''} ${layer.locked ? 'data-layer-locked' : ''}>
      <button type="button" class="whiteboard-layer-select" data-a="whiteboardSelect" data-id="${esc(node.id)}" aria-pressed="${layer.nodes.every(item => selected.has(item.id))}" title="${label}" ${layer.hidden ? 'disabled' : ''}>${ic(typeIcon, 16)}<span><strong>${label}</strong>${details ? `<small>${details}</small>` : ''}</span></button>
      ${editable ? `<button type="button" class="ibtn whiteboard-layer-visibility" data-a="whiteboardLayerVisibility" data-id="${esc(layer.id)}" data-hidden="${!layer.hidden}" aria-label="${visibility} · ${label}" title="${visibility}">${ic(layer.hidden ? 'eye-off' : 'eye', 16)}</button>` : ''}
      ${
        editable
          ? `<button type="button" class="ibtn whiteboard-layer-lock" data-a="whiteboardLayerPositionLock" data-id="${esc(layer.id)}" data-locked="${!layer.locked}" aria-label="${positionLock} · ${label}" title="${positionLock}">${ic(layer.locked ? 'lock-keyhole' : 'lock-open', 16)}</button>`
          : layer.locked
            ? `<span class="whiteboard-layer-lock" role="img" aria-label="${T('Position locked', 'Положение зафиксировано')}" title="${T('Position locked', 'Положение зафиксировано')}">${ic('lock-keyhole', 16)}</span>`
            : ''
      }
      ${editable && !layer.locked ? `<button type="button" class="ibtn whiteboard-layer-handle" data-layer-handle="${esc(layer.id)}" aria-describedby="whiteboard-layer-help" aria-label="${T('Reorder layer', 'Переместить слой')} · ${label}">${ic('grip-vertical', 18)}</button>` : ''}
    </li>`;
  });
  return `<aside class="whiteboard-layers-panel" id="whiteboard-layers-panel" data-whiteboard-layers aria-labelledby="whiteboard-layers-title">
    <header class="whiteboard-layers-heading"><div><h2 id="whiteboard-layers-title">${T('Layers', 'Слои')}</h2><small>${T('Front layer at the top', 'Передний план сверху')}</small></div><button type="button" class="ibtn" data-a="whiteboardToggleLayers" aria-label="${T('Close layers', 'Закрыть слои')}" title="${T('Close layers', 'Закрыть слои')}">${ic('x', 16)}</button></header>
    <p id="whiteboard-layer-help" class="sr">${T('Drag the handle or press Up or Down to reorder.', 'Перетаскивайте за ручку или нажмите стрелку вверх или вниз.')}</p>
    <ol class="whiteboard-layers-list" role="list" data-keep="whiteboard-layers:${esc(state.scope)}">${rows.join('')}</ol>
    ${rows.length ? '' : `<p class="whiteboard-layers-empty">${T('Add a card to show its layer here.', 'Добавьте карточку, чтобы увидеть её слой.')}</p>`}
  </aside>`;
}

const mounted = new WeakSet();
export function mountWhiteboardLayerDrag(panel, dropLayer) {
  if (!panel || mounted.has(panel)) return;
  mounted.add(panel);
  const list = panel.querySelector('.whiteboard-layers-list');
  let drag, frame;
  const tierRows = row => [...list.querySelectorAll('[data-layer-row]')].filter(item => item.dataset.layerTier === row.dataset.layerTier);

  function preview() {
    const rect = list.getBoundingClientRect();
    const { x, y, neighbors } = drag;
    const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    const row = inside ? neighbors.find(item => y < item.getBoundingClientRect().bottom) || neighbors.at(-1) : null;
    const bounds = row?.getBoundingClientRect();
    const position = bounds && (y < bounds.top + bounds.height / 2 ? 'before' : 'after');
    if (row !== drag.target || position !== drag.position) {
      drag.target?.removeAttribute('data-layer-drop');
      drag.target = row;
      drag.position = position;
      if (row) row.dataset.layerDrop = position;
    }
    return inside ? rect : null;
  }
  function scrollWhileDragging() {
    if (!drag) return;
    if (!panel.isConnected) return finish();
    frame = requestAnimationFrame(scrollWhileDragging);
    const bounds = preview();
    if (!bounds) return;
    const zone = 34;
    const delta = drag.y < bounds.top + zone ? drag.y - bounds.top - zone : Math.max(0, drag.y - bounds.bottom + zone);
    if (delta) list.scrollTop += Math.sign(delta) * Math.ceil(Math.abs(delta) / 3);
  }
  function finish(event, commit = false) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const pending = drag;
    drag = null;
    cancelAnimationFrame(frame);
    pending.row.removeAttribute('data-layer-dragging');
    pending.target?.removeAttribute('data-layer-drop');
    if (pending.handle.hasPointerCapture(pending.pointerId)) pending.handle.releasePointerCapture(pending.pointerId);
    if (commit && pending.target && panel.isConnected) dropLayer(pending.row.dataset.layerRow, pending.target.dataset.layerRow, pending.position);
  }

  list.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-layer-handle]');
    if (!handle || event.button !== 0 || drag) return;
    const row = handle.closest('[data-layer-row]');
    const neighbors = tierRows(row).filter(item => item !== row);
    if (!neighbors.length) return;
    drag = { pointerId: event.pointerId, row, handle, neighbors, x: event.clientX, y: event.clientY, startY: event.clientY };
    handle.setPointerCapture(event.pointerId);
  });
  list.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    Object.assign(drag, { x: event.clientX, y: event.clientY });
    if (!drag.active && Math.abs(drag.y - drag.startY) >= 5) {
      drag.active = true;
      drag.row.setAttribute('data-layer-dragging', '');
      scrollWhileDragging();
    }
    if (drag.active) preview();
  });
  list.addEventListener('pointerup', event => {
    if (drag?.active && event.pointerId === drag.pointerId) {
      Object.assign(drag, { x: event.clientX, y: event.clientY });
      preview();
    }
    finish(event, true);
  });
  list.addEventListener('pointercancel', finish);
  list.addEventListener('lostpointercapture', finish);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (drag) finish();
      else panel.querySelector('[data-a="whiteboardToggleLayers"]')?.click();
      return;
    }
    const handle = event.target.closest('[data-layer-handle]');
    if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const row = handle.closest('[data-layer-row]');
    const up = event.key === 'ArrowUp';
    const rows = tierRows(row);
    const neighbor = rows[rows.indexOf(row) + (up ? -1 : 1)];
    event.preventDefault();
    if (neighbor) dropLayer(row.dataset.layerRow, neighbor.dataset.layerRow, up ? 'before' : 'after');
  });
}
