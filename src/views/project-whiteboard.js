import { whiteboardMinimap } from '../ui/whiteboard-minimap.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { whiteboardPortableControl } from '../ui/whiteboard-portable.js';
import { diagramViewsControl } from '../ui/diagram-views.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { whiteboardLabel, whiteboardMaterial, whiteboardState, wbText as T, wbCount as C } from '../core/whiteboard-state.js';
const button = (action, icon, en, ru, extra = '', context = '') =>
  `<button class="ibtn" data-a="${action}" aria-label="${esc(T(en, ru) + (context ? ': ' + context : ''))}" title="${esc(T(en, ru) + (context ? ': ' + context : ''))}" ${extra}>${ic(icon, 16)}</button>`;
const icons = { text: 'sticky-note', material: 'file-text', group: 'square-dashed' };
function outlineHtml(board, editable, state) {
  const query = (state.outlineQuery || '').trim().toLocaleLowerCase();
  const frames = board.nodes.filter(n => n.type === 'group').sort((a, b) => a.width * a.height - b.width * b.height);
  const owner = n =>
    frames.find(f => n.id !== f.id && n.x >= f.x && n.y >= f.y && n.x + n.width <= f.x + f.width && n.y + n.height <= f.y + f.height)?.id || '';
  const card = n =>
    `<div class="whiteboard-outline-entry">${whiteboardCard(n, editable, true)}<button class="btn btn-ghost btn-sm" data-a="whiteboardLocate" data-id="${esc(n.id)}">${ic('locate', 14)}${T('Find on canvas', 'Найти на холсте')}</button></div>`;
  const matchingFrames = frames.filter(f => whiteboardLabel(f).toLocaleLowerCase().includes(query));
  const matches = board.nodes.filter(
    n => n.type !== 'group' && (matchingFrames.some(f => f.id === owner(n)) || `${whiteboardLabel(n)} ${n.text || ''}`.toLocaleLowerCase().includes(query)),
  );
  return `${frames.length ? `<div class="whiteboard-outline-group-tools"><button class="btn btn-ghost btn-sm" data-a="whiteboardOutlineGroups" data-collapse="false">${T('Expand all', 'Развернуть все')}</button><button class="btn btn-ghost btn-sm" data-a="whiteboardOutlineGroups" data-collapse="true" ${query ? 'disabled' : ''}>${T('Collapse all', 'Свернуть все')}</button></div>` : ''}<label class="field"><span class="sr">${T('Search cards', 'Поиск карточек')}</span><input class="input" data-in="whiteboardOutlineQuery" value="${esc(state.outlineQuery || '')}" placeholder="${T('Search cards', 'Поиск карточек')}"></label><p class="hint" role="status">${C(matches.length + frames.filter(f => matchingFrames.includes(f) || matches.some(n => owner(n) === f.id)).length, 'result')}</p>${matches
    .filter(n => !owner(n))
    .map(card)
    .join('')}${frames
    .map(f => {
      const children = matches.filter(n => owner(n) === f.id);
      return !children.length && query && !matchingFrames.includes(f)
        ? ''
        : `<details class="whiteboard-outline-group" data-board-group="${esc(f.id)}" ${query || !state.collapsedGroups?.[f.id] ? 'open' : ''}><summary><span translate="no">${esc(whiteboardLabel(f))}</span> · ${C(children.length, 'card')}</summary>${card(f)}${children.map(card).join('')}</details>`;
    })
    .join('')}${!matches.length && !matchingFrames.length && query ? `<p class="hint">${T('No matching cards.', 'Карточки не найдены.')}</p>` : ''}`;
}
export function whiteboardCard(node, editable, outline = false) {
  const label = esc(whiteboardLabel(node)),
    state = whiteboardState();
  const material = node.type === 'material' ? whiteboardMaterial(node) : null;
  return `<article class="whiteboard-card ${state.selection?.includes(node.id) || state.selected === node.id ? 'selected' : ''} ${outline ? 'in-outline' : ''}" data-board-id="${esc(node.id)}" data-kind="${node.type}" data-color="${node.color}" aria-label="${label}" ${outline ? '' : `style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"`}>
    <div class="whiteboard-card-head">${state.multiSelect ? `<label class="whiteboard-select-box"><input type="checkbox" data-in="whiteboardSelection" data-id="${esc(node.id)}" aria-label="${T('Select card', 'Выбрать карточку')}: ${label}" ${state.selection?.includes(node.id) ? 'checked' : ''}></label>` : ''}<button class="whiteboard-drag" data-board-drag="${esc(node.id)}" data-a="whiteboardSelect" data-id="${esc(node.id)}" aria-label="${esc(T('Select card', 'Выбрать карточку'))}: ${label}" aria-describedby="whiteboard-help">${ic(icons[node.type], 15)}<strong>${label}</strong></button>${editable ? button('whiteboardEdit', 'pencil', 'Edit card', 'Изменить карточку', `data-id="${esc(node.id)}"`, whiteboardLabel(node)) : ''}</div>
    ${node.type === 'group' ? '' : `<div class="whiteboard-card-content">${node.type === 'material' ? `<p class="hint">${esc(T('Linked material · opens the original', 'Связанный материал · открывается оригинал'))}</p>${material ? `<button class="btn btn-secondary btn-sm" data-a="openRelatedEntity" data-key="${esc(node.target)}">${ic('arrow-up-right', 14)}${esc(T('Open material', 'Открыть материал'))}</button>` : `<p class="hint">${esc(T('It may have been removed, or access is unavailable.', 'Возможно, материал удалён или нет доступа.'))}</p><button class="link" data-a="whiteboardRetryMaterials">${esc(T('Retry', 'Повторить'))}</button>`}` : `<p>${esc(node.text || T('Add your thoughts…', 'Добавьте свои мысли…'))}</p>`}</div>`}
  </article>`;
}
export function whiteboardEdges(board) {
  const nodes = new Map(board.nodes.map(n => [n.id, n]));
  return `<svg class="whiteboard-edges" aria-hidden="true"><defs><marker id="whiteboard-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>${board.edges
    .map(edge => {
      const a = nodes.get(edge.from),
        b = nodes.get(edge.to);
      if (!a || !b) return '';
      const right = b.x + b.width / 2 >= a.x + a.width / 2;
      const x1 = a.x + (right ? a.width : 0),
        y1 = a.y + a.height / 2,
        x2 = b.x + (right ? 0 : b.width),
        y2 = b.y + b.height / 2;
      const bend = Math.max(60, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);
      return `<g data-color="${edge.color}"><path d="M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}" ${edge.arrow ? 'marker-end="url(#whiteboard-arrow)"' : ''}/>${edge.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}">${esc(edge.label.slice(0, 40))}</text>` : ''}</g>`;
    })
    .join('')}</svg>`;
}
export function projectWhiteboard(project) {
  const board = whiteboardOf(project),
    state = whiteboardState(project.id),
    editable = !project.archived && canEditWhiteboard(D(), project, D().me, S.ui.currentUser?.role);
  if (!state.selected) state.selection = [];
  const selectedIds = (state.selection?.length ? state.selection : state.selected ? [state.selected] : []).filter(id => board.nodes.some(n => n.id === id));
  const selectedMaterial = selectedIds.length === 1 ? board.nodes.find(n => n.id === selectedIds[0] && n.type === 'material' && whiteboardMaterial(n)) : null;
  const edgeList = board.edges
    .map(
      edge =>
        `<button class="whiteboard-edge-row" data-a="whiteboardEditEdge" data-id="${esc(edge.id)}">${ic('move-right', 14)}<span>${esc(whiteboardLabel(board.nodes.find(n => n.id === edge.from)))} → ${esc(whiteboardLabel(board.nodes.find(n => n.id === edge.to)))}</span><small>${esc(edge.label)}</small></button>`,
    )
    .join('');
  return `<section class="project-whiteboard${state.focus ? ' is-focused' : ''}" data-project="${esc(project.id)}" aria-label="${T('Whiteboard canvas', 'Содержимое холста')}" translate="no"><div class="whiteboard-toolbar">
  ${
    editable
      ? `<details class="ui-menu whiteboard-add"><summary class="btn btn-primary btn-sm" aria-label="${T('Add', 'Добавить')}">${ic('plus', 15)}<span>${T('Add', 'Добавить')}</span></summary><div>${[
          ['whiteboardNewText', 'sticky-note', 'Text card', 'Текстовая карточка'],
          ['whiteboardAddMaterial', 'file-plus', 'Linked material', 'Связанный материал'],
          ['whiteboardNewFrame', 'square-dashed', 'Frame', 'Рамка'],
          ['whiteboardNewEdge', 'move-right', 'Connection', 'Связь'],
        ]
          .map(([a, i, en, ru]) => `<button data-a="${a}">${ic(i, 15)}${T(en, ru)}</button>`)
          .join('')}</div></details>${button('whiteboardUndo', 'undo-2', 'Undo', 'Отменить', state.undo.length ? '' : 'disabled')}`
      : `<span class="hint">${T('Read only', 'Только просмотр')}</span>`
  }
  ${button('whiteboardToggleSelection', 'square-check', 'Select cards', 'Выбрать карточки', `aria-pressed="${!!state.multiSelect}"`)}<span class="whiteboard-count">${board.nodes.length} / 200 · ${C(board.edges.length, 'connection')}</span><span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="whiteboardToggleOutline" aria-label="${T('Outline or canvas', 'Список или холст')}" aria-pressed="${state.outline}">${ic(state.outline ? 'layout-dashboard' : 'list', 15)}<span>${state.outline ? T('Canvas', 'Холст') : T('Outline', 'Список')}</span></button><button class="btn btn-secondary btn-sm whiteboard-focus-toggle" data-a="whiteboardToggleFocus" aria-label="${state.focus ? T('Exit focus', 'Выйти из фокуса') : T('Focus', 'Фокус')}" aria-pressed="${!!state.focus}">${ic(state.focus ? 'minimize' : 'maximize', 15)}<span>${state.focus ? T('Exit focus', 'Выйти') : T('Focus', 'Фокус')}</span></button><details class="ui-menu whiteboard-tools" ${disclosureAttributes('whiteboard-tools:' + project.id)}><summary class="ibtn" aria-label="${T('More tools', 'Другие инструменты')}" title="${T('More tools', 'Другие инструменты')}">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost btn-sm" data-a="whiteboardToggleMinimap" aria-pressed="${!!state.minimap}">${ic('map', 15)}${T('Minimap', 'Миникарта')}</button><span>${T('History and layouts', 'История и раскладки')}</span>${editable ? button('whiteboardRedo', 'redo-2', 'Redo', 'Повторить', state.redo.length ? '' : 'disabled') + button('whiteboardPaste', 'clipboard-paste', 'Paste cards', 'Вставить карточки') : ''}${button('whiteboardHistory', 'history', 'Whiteboard history', 'История холста')}${diagramViewsControl('board', project.id)}${whiteboardPortableControl(editable)}</div></details>
  </div><p id="whiteboard-help" class="sr">${T('Move cards by their title. Drag empty space to pan; pinch or Ctrl + wheel to zoom. Arrow keys on a selected card move it. Outline mode lists every card and connection.', 'Перемещайте карточки за заголовок. Пустое место — панорама; щипок или Ctrl + колесо — масштаб. Стрелки на выбранной карточке перемещают её. В списке доступны все карточки и связи.')}</p>
  ${
    state.outline
      ? `<div class="whiteboard-outline">${outlineHtml(board, editable, state)}<h3>${T('Connections', 'Связи')}</h3>${edgeList || `<p class="hint">${T('No connections yet.', 'Связей пока нет.')}</p>`}</div>`
      : `<div class="whiteboard-gesture"><button class="btn btn-secondary btn-sm" data-a="whiteboardTogglePan" aria-pressed="${state.navigationMode === 'pan'}">${ic('hand', 15)}${T('Pan and zoom', 'Панорама и масштаб')}</button><span class="hint">${T('Tap a card to select. Toggle to drag or pinch.', 'Нажмите карточку для выбора. Включите перемещение для панорамы и щипка.')}</span></div><div class="whiteboard-viewport" data-navigation="${state.navigationMode}" tabindex="0" aria-label="${T('Whiteboard navigation', 'Навигация по холсту')}" aria-describedby="whiteboard-help"><div class="whiteboard-world" style="transform:translate(${state.x}px,${state.y}px) scale(${state.zoom})">${whiteboardEdges(board)}${[
          ...board.nodes,
        ]
          .sort((a, b) => (a.type !== 'group') - (b.type !== 'group'))
          .map(n => whiteboardCard(n, editable))
          .join(
            '',
          )}</div>${!board.nodes.length ? `<div class="whiteboard-empty">${ic('layout-dashboard', 32)}<h2>${T('Give your ideas room', 'Разложите идеи по местам')}</h2><p>${T('Arrange cards and materials, then connect them.', 'Разместите карточки и материалы, затем свяжите их.')}</p>${editable ? `<button class="btn btn-primary btn-sm" data-a="whiteboardNewText">${ic('plus', 15)}${T('First card', 'Первая карточка')}</button>` : ''}</div>` : ''}${whiteboardMinimap(board, state)}<div class="whiteboard-navigation">${button('whiteboardZoomOut', 'minus', 'Zoom out', 'Уменьшить')}<button class="whiteboard-scale" data-a="whiteboardResetZoom" aria-label="${T('Reset zoom', 'Сбросить масштаб')}">${Math.round(state.zoom * 100)}%</button>${button('whiteboardZoomIn', 'plus', 'Zoom in', 'Увеличить')}${button('whiteboardFit', 'scan', 'Fit all cards', 'Показать весь холст')}</div></div>`
  }
  ${
    state.selected
      ? `<div class="whiteboard-selection"><span class="trunc">${selectedIds.length > 1 ? T('Selected', 'Выбрано') + ': ' + selectedIds.length : esc(whiteboardLabel(board.nodes.find(n => n.id === state.selected) || { type: 'text' }))}</span>${selectedMaterial ? `<button class="btn btn-secondary btn-sm" data-a="openRelatedEntity" data-key="${esc(selectedMaterial.target)}">${ic('arrow-up-right', 16)}${T('Open material', 'Открыть материал')}</button>` : ''}${
          editable
            ? `${button('whiteboardEdit', 'pencil', 'Edit card', 'Изменить карточку')}${button('whiteboardNewEdge', 'move-right', 'Connect card', 'Связать карточку')}${button('whiteboardCopy', 'copy', 'Copy cards', 'Копировать карточки')}${
                selectedIds.length > 1
                  ? `<details class="ui-menu whiteboard-add whiteboard-arrange"><summary class="ibtn" aria-label="${T('Arrange cards', 'Выровнять карточки')}">${ic('align-start-vertical', 16)}</summary><div>${[
                      ['left', 'Align left', 'По левому краю'],
                      ['right', 'Align right', 'По правому краю'],
                      ['top', 'Align top', 'По верхнему краю'],
                      ['bottom', 'Align bottom', 'По нижнему краю'],
                      ['center-x', 'Center horizontally', 'По центру по горизонтали'],
                      ['center-y', 'Center vertically', 'По центру по вертикали'],
                      ['distribute-x', 'Distribute horizontally', 'Распределить по горизонтали'],
                      ['distribute-y', 'Distribute vertically', 'Распределить по вертикали'],
                    ]
                      .map(
                        ([mode, en, ru]) =>
                          `<button data-a="whiteboardArrange" data-mode="${mode}" ${mode.startsWith('distribute') && selectedIds.length < 3 ? 'disabled' : ''}>${T(en, ru)}</button>`,
                      )
                      .join('')}</div></details>`
                  : ''
              }${button('whiteboardDelete', 'trash-2', 'Remove card', 'Убрать карточку')}`
            : ''
        }${button('whiteboardDeselect', 'x', 'Clear selection', 'Снять выделение')}</div>`
      : ''
  }
  <details class="whiteboard-help"><summary>${T('Navigation and limits', 'Навигация и ограничения')}</summary><p>${T('Drag empty space to pan. Pinch or Ctrl + wheel to zoom. Use Outline on phones and keyboards. Boards support 200 cards and 400 connections. Changes use workspace synchronization; simultaneous editing of the same field may require conflict review.', 'Пустое место — панорама. Щипок или Ctrl + колесо — масштаб. На телефоне и с клавиатурой удобно работать в списке. До 200 карточек и 400 связей. Работает синхронизация пространства; одновременные изменения одного поля могут потребовать разрешения конфликта.')}</p></details></section>`;
}
