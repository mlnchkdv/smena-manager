import { whiteboardMinimap } from '../ui/whiteboard-minimap.js';
import { A } from '../actions/actions.js';
import { toast } from '../ui/toast.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { esc } from '../core/utils.js';
import { whiteboardMaterialPreview } from '../shared/whiteboard-material.js';
import { whiteboardMediaPosition, formatWhiteboardTime } from '../shared/whiteboard-media.js';
import { bookmarkThumbnail } from '../ui/bookmark-thumbnail.js';
import '../styles/pages/bookmark-thumbnails.css';
import { normalizedPageUrl } from '../shared/bookmark-metadata.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { whiteboardPresentationNavigation } from '../ui/whiteboard-presentation.js';
import { whiteboardConnectionText } from '../ui/whiteboard-edge-text.js';
import { whiteboardCurve, whiteboardShapeSvg, whiteboardShapeInsets } from '../shared/whiteboard-diagram.js';
import { whiteboardOf, whiteboardEdgeEnd, whiteboardLockedIds, whiteboardPaintOrder, whiteboardVisibleBoard } from '../shared/project-whiteboard.js';
import { groupSelectionBox, groupSelectionToolbar, savedWhiteboardGroups } from '../ui/whiteboard-group-selection.js';
import { expandWhiteboardSelection } from '../shared/whiteboard-selection.js';
import { whiteboardLayersPanel } from '../ui/whiteboard-layers-panel.js';
import { whiteboardConnectionControls, whiteboardContext, whiteboardNavigation, whiteboardNavigationHint } from '../ui/whiteboard-context.js';
import { whiteboardLabel, whiteboardMaterial, whiteboardNavigationMode, whiteboardState, wbText as T, wbCount as C } from '../core/whiteboard-state.js';
const button = (action, icon, en, ru, extra = '', context = '') =>
  `<button class="ibtn" data-a="${action}" aria-label="${esc(T(en, ru) + (context ? ': ' + context : ''))}" title="${esc(T(en, ru) + (context ? ': ' + context : ''))}" ${extra}>${ic(icon, 16)}</button>`;
const icons = { text: 'sticky-note', material: 'file-text', group: 'square-dashed', shape: 'shapes' };
function materialContent(node, preview, source) {
  if (!preview)
    return `<p class="hint">${esc(T('It may have been removed, or access is unavailable.', 'Возможно, материал удалён или нет доступа.'))}</p><button class="link" data-a="whiteboardRetryMaterials">${T('Retry', 'Повторить')}</button>`;
  const names = {
    note: T('Note', 'Заметка'),
    task: T('Task', 'Задача'),
    project: T('Project', 'Проект'),
    bookmark: T('Bookmark', 'Закладка'),
    file: T('File', 'Файл'),
    whiteboard: T('Whiteboard', 'Холст'),
  };
  const media = preview.kind === 'file' ? whiteboardMediaPosition(source.item, node.media) : null;
  const inline = ['image', 'pdf'].includes(media?.kind);
  const page = (!media?.fixed && whiteboardState().mediaPages?.[node.id]) || media?.page || 1;
  const position =
    media?.page && !media.fixed ? T(`Page ${media.page}`, `Страница ${media.page}`) : media?.seconds != null ? formatWhiteboardTime(media.seconds) : '';
  const website = preview.kind === 'bookmark' && normalizedPageUrl(source.item.url);
  const openPreview = media?.image ? T('Open original', 'Открыть оригинал') : T('Open preview', 'Открыть предпросмотр');
  return `<span class="whiteboard-material-kind">${esc(names[preview.kind] || T('Material', 'Материал'))}${position ? ` · ${esc(position)}` : ''}</span>${inline ? `<div class="whiteboard-inline-preview" data-whiteboard-media="${esc(node.id)}" data-media-page="${media.kind === 'pdf' ? page : 1}"><span class="hint" role="status">${T('Loading preview…', 'Загружаем предпросмотр…')}</span></div>${media.kind === 'pdf' && !media.fixed ? `<div class="whiteboard-media-pages" role="group" aria-label="${T('PDF pages', 'Страницы PDF')}"><button class="ibtn" data-a="whiteboardMediaPage" data-id="${esc(node.id)}" data-step="-1" aria-label="${T('Previous PDF page', 'Предыдущая страница PDF')}" disabled>${ic('chevron-left', 14)}</button><span data-whiteboard-page-label aria-live="polite">${page} / …</span><button class="ibtn" data-a="whiteboardMediaPage" data-id="${esc(node.id)}" data-step="1" aria-label="${T('Next PDF page', 'Следующая страница PDF')}" disabled>${ic('chevron-right', 14)}</button></div>` : ''}` : website ? bookmarkThumbnail(source.item, new URL(website).hostname, { action: 'whiteboardOpenWebsite', id: node.id }) : preview.text ? `<p class="whiteboard-material-excerpt" translate="no">${esc(preview.text)}</p>` : ''}${preview.tags.length && !inline ? `<div class="whiteboard-material-tags" translate="no">${preview.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>` : ''}${website ? `<button class="btn btn-ghost btn-sm" data-a="whiteboardOpenWebsite" data-id="${esc(node.id)}">${ic('globe', 14)}${T('View website', 'Просмотреть сайт')}</button>` : media?.kind ? `<button class="btn btn-ghost btn-sm" data-a="whiteboardOpenMedia" data-id="${esc(node.id)}">${ic('expand', 14)}${openPreview}</button>` : `<button class="btn btn-ghost btn-sm" data-a="openRelatedEntity" data-key="${esc(node.target)}">${ic('arrow-up-right', 14)}${T('Open material', 'Открыть материал')}</button>`}`;
}
// The view can arrive before its interaction chunk. Keep the first navigation
// action rather than dropping it while afterRender imports that chunk.
for (const action of ['whiteboardPickFromList', 'whiteboardTogglePan']) {
  if (A[action]) continue;
  const load = async () => {
    const scope = whiteboardState().scope,
      route = S.ui.route,
      params = JSON.stringify(S.ui.params);
    try {
      await import('../features/project-whiteboard.js');
      if (whiteboardState().scope === scope && S.ui.route === route && JSON.stringify(S.ui.params) === params && !S.ui.modals.length && A[action] !== load)
        A[action]();
    } catch {
      toast(T('Unable to load board tools. Refresh and try again.', 'Не удалось загрузить инструменты холста. Обновите страницу и повторите.'), {
        kind: 'err',
      });
    }
  };
  A[action] = load;
}
function outlineHtml(board, editable, state, lockedIds) {
  const query = (state.outlineQuery || '').trim().toLocaleLowerCase();
  const frames = board.nodes.filter(n => n.type === 'group').sort((a, b) => a.width * a.height - b.width * b.height);
  const owner = n =>
    frames.find(f => n.id !== f.id && n.x >= f.x && n.y >= f.y && n.x + n.width <= f.x + f.width && n.y + n.height <= f.y + f.height)?.id || '';
  const card = n =>
    `<div class="whiteboard-outline-entry">${whiteboardCard(n, editable, true, lockedIds.has(n.id))}<button class="btn btn-ghost btn-sm" data-a="whiteboardLocate" data-id="${esc(n.id)}">${ic('locate', 14)}${T('Find on canvas', 'Найти на холсте')}</button></div>`;
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
export function whiteboardCard(node, editable, outline = false, locked = !!node.locked) {
  const label = esc(whiteboardLabel(node)),
    state = whiteboardState();
  const material = node.type === 'material' ? whiteboardMaterial(node) : null;
  const preview = whiteboardMaterialPreview(material);
  const inset = whiteboardShapeInsets(node.shape);
  const positionLabel = locked ? ' · ' + T('Position locked', 'Положение зафиксировано') : '';
  return `<article class="whiteboard-card ${state.selection?.includes(node.id) || state.selected === node.id ? 'selected' : ''} ${outline ? 'in-outline' : ''}" data-board-id="${esc(node.id)}" data-kind="${node.type}" ${locked ? 'data-position-locked' : ''} data-media-preview="${preview?.kind === 'bookmark' || (preview?.kind === 'file' && ['image', 'pdf'].includes(whiteboardMediaPosition(material.item, node.media).kind))}" data-shape="${node.shape || ''}" data-color="${node.color}" aria-label="${label}${positionLabel}" ${outline ? '' : `style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;--shape-pad-x:${Math.round(node.width * inset.x)}px;--shape-pad-y:${Math.round(node.height * inset.y)}px"`}>
    ${node.type === 'shape' && !outline ? `<svg class="whiteboard-shape-art" viewBox="0 0 ${node.width} ${node.height}" preserveAspectRatio="none" aria-hidden="true">${whiteboardShapeSvg({ ...node, x: 0, y: 0 })}</svg>` : ''}<div class="whiteboard-card-head">${state.multiSelect ? `<label class="whiteboard-select-box"><input type="checkbox" data-in="whiteboardSelection" data-id="${esc(node.id)}" aria-label="${T('Select card', 'Выбрать карточку')}: ${label}" ${state.selection?.includes(node.id) ? 'checked' : ''}></label>` : ''}<button class="whiteboard-drag" data-board-drag="${esc(node.id)}" data-a="whiteboardSelect" data-id="${esc(node.id)}" aria-pressed="${!!(state.selection?.includes(node.id) || state.selected === node.id)}" aria-label="${esc(T('Select card', 'Выбрать карточку'))}: ${label}${positionLabel}" aria-describedby="whiteboard-help">${ic(locked ? 'lock-keyhole' : preview?.icon || icons[node.type], 15)}<strong>${label}</strong></button>${editable ? button('whiteboardEdit', 'pencil', 'Edit card', 'Изменить карточку', `data-id="${esc(node.id)}"`, whiteboardLabel(node)) : ''}</div>
    ${node.type === 'group' ? '' : `<div class="whiteboard-card-content">${node.type === 'material' ? materialContent(node, preview, material) : `<p>${esc(node.text || T('Add your thoughts…', 'Добавьте свои мысли…'))}</p>`}</div>`}
    ${editable && !outline && !locked && state.selected === node.id ? `<span id="whiteboard-resize-help" class="sr">${T('Drag an edge or corner. On the corner handle, use arrow keys to resize, Shift for larger steps. Escape cancels a drag. Resizing a frame keeps its contents unchanged.', 'Потяните край или угол. На угловом маркере меняйте размер стрелками, Shift — крупный шаг. Escape отменяет перетаскивание. Размер рамки меняется без изменения содержимого.')}</span><span class="whiteboard-resize-size" aria-hidden="true"></span>${['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map(direction => `<button class="whiteboard-resize" data-board-resize="${direction}" tabindex="${direction === 'se' ? '0' : '-1'}" aria-label="${esc(T('Resize card', 'Изменить размер карточки'))}: ${label} (${direction.toUpperCase()})" aria-describedby="whiteboard-resize-help" title="${esc(T('Drag to resize', 'Потяните, чтобы изменить размер'))}"></button>`).join('')}` : ''}
    ${editable && !outline && state.selected === node.id ? `<button class="whiteboard-connect" data-board-connect="${esc(node.id)}" data-a="whiteboardConnectStart" data-id="${esc(node.id)}" aria-label="${esc(T('Connect from card', 'Связать с другой карточкой'))}: ${label}" title="${esc(T('Drag to another card, or click then choose a card', 'Перетащите на другую карточку или нажмите и выберите её'))}">${ic('plus', 14)}</button>` : ''}
  </article>`;
}
export function whiteboardEdges(board) {
  const nodes = new Map(board.nodes.map(n => [n.id, n]));
  return `<svg class="whiteboard-edges" aria-label="${T('Visual connections', 'Визуальные связи')}"><defs><marker id="whiteboard-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker><marker id="whiteboard-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx="5" cy="5" r="4" fill="context-stroke"/></marker></defs>${board.edges
    .map(edge => {
      const a = nodes.get(edge.from),
        b = nodes.get(edge.to);
      if (!a || !b) return '';
      const { x1, y1, x2, y2, d } = whiteboardCurve(a, b);
      const ends = side => {
        const value = whiteboardEdgeEnd(edge, side);
        return value === 'none' ? '' : `marker-${side === 'from' ? 'start' : 'end'}="url(#whiteboard-${value})"`;
      };
      const label = esc(T('Select visual connection', 'Выбрать визуальную связь') + ': ' + whiteboardConnectionText(board, edge, whiteboardLabel));
      return `<g data-color="${edge.color}" data-line-style="${edge.style || 'solid'}" ${whiteboardState().selectedEdge === edge.id ? 'data-selected="true"' : ''}><path d="${d}" aria-hidden="true" ${ends('from')} ${ends('to')}/><path class="whiteboard-edge-hit" d="${d}" data-a="whiteboardSelectEdge" data-id="${esc(edge.id)}" data-board-edge="${esc(edge.id)}" role="button" tabindex="0" aria-label="${label}"><title>${label}</title></path>${edge.label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}">${esc(edge.label.slice(0, 40))}</text>` : ''}</g>`;
    })
    .join('')}</svg>`;
}
function connectionHandles(board, state, editable) {
  const edge = editable && board.edges.find(edge => edge.id === state.selectedEdge);
  const a = edge && board.nodes.find(n => n.id === edge.from),
    b = edge && board.nodes.find(n => n.id === edge.to);
  if (!a || !b) return '';
  const { x1, y1, x2, y2 } = whiteboardCurve(a, b);
  return [
    ['from', x1, y1],
    ['to', x2, y2],
  ]
    .map(
      ([side, x, y]) =>
        `<button class="whiteboard-edge-end" style="left:${x}px;top:${y}px" data-board-reconnect="${side}" data-id="${esc(edge.id)}" data-a="whiteboardReconnectStart" aria-label="${side === 'from' ? T('Move connection start', 'Перенести начало связи') : T('Move connection end', 'Перенести конец связи')}" title="${T('Drag to a card, or click and select one', 'Перетащите на карточку или нажмите и выберите её')}">${ic('grip', 14)}</button>`,
    )
    .join('');
}
export function projectWhiteboard(project) {
  const stored = whiteboardOf(project),
    board = whiteboardVisibleBoard(stored),
    state = whiteboardState(project.id),
    editable = !state.presentationId && !project.archived && canEditWhiteboard(D(), project, D().me, S.ui.currentUser?.role);
  const navigationMode = whiteboardNavigationMode(state);
  const layersOpen = state.layersOpen && !state.outline && !state.presentationId;
  const lockedIds = whiteboardLockedIds(board);
  if (state.connectFrom && !board.nodes.some(node => node.id === state.connectFrom)) state.connectFrom = '';
  if (state.reconnect && !board.edges.some(edge => edge.id === state.reconnect.id)) state.reconnect = null;
  if (state.selectedEdge && !board.edges.some(edge => edge.id === state.selectedEdge)) state.selectedEdge = '';
  const connectionSource = editable && board.nodes.find(node => node.id === (state.connectFrom || state.reconnect?.from));
  const selectedIds = expandWhiteboardSelection(board, state.selected ? (state.selection?.length ? state.selection : [state.selected]) : []);
  state.selection = selectedIds;
  if (!selectedIds.includes(state.selected)) state.selected = selectedIds[0] || '';
  const selectionHelp =
    state.outline || navigationMode === 'scroll'
      ? T('Tap cards to add or remove them from the selection.', 'Нажимайте на карточки, чтобы добавить или убрать их из выделения.')
      : T('Tap cards or drag a box from empty space to select several.', 'Нажимайте на карточки или растяните рамку с пустого места.');
  const empty = stored.nodes.length
    ? `<div class="whiteboard-empty">${ic('eye-off', 32)}<h2>${T('All layers are hidden', 'Все слои скрыты')}</h2><p>${T('Show layers from the Layers panel.', 'Покажите нужные слои в панели «Слои».')}</p>${layersOpen ? '' : `<button class="btn btn-secondary btn-sm" data-a="whiteboardToggleLayers">${T('Open layers', 'Открыть слои')}</button>`}</div>`
    : `<div class="whiteboard-empty">${ic('layout-dashboard', 32)}<h2>${T('Give your ideas room', 'Разложите идеи по местам')}</h2><p>${T('Arrange cards and materials, then connect them.', 'Разместите карточки и материалы, затем свяжите их.')}</p>${editable ? `<button class="btn btn-primary btn-sm" data-a="whiteboardNewText">${ic('plus', 15)}${T('First card', 'Первая карточка')}</button>` : ''}</div>`;
  const edgeList = board.edges
    .map(
      edge =>
        `<button class="whiteboard-edge-row" data-a="whiteboardSelectEdge" data-id="${esc(edge.id)}">${ic('move-right', 14)}<span>${esc(whiteboardConnectionText(board, edge, whiteboardLabel))}</span><small>${esc(edge.label)}</small></button>`,
    )
    .join('');
  const mobileView = state.presentationId
    ? ''
    : `<div class="seg whiteboard-mobile-view" role="group" aria-label="${T('Whiteboard view', 'Вид холста')}">
      <button type="button" data-a="whiteboardToggleOutline" data-view="canvas" class="${state.outline ? '' : 'on'}" aria-pressed="${!state.outline}">${ic('layout-dashboard', 15)}${T('Canvas', 'Холст')}</button>
      <button type="button" data-a="whiteboardToggleOutline" data-view="list" class="${state.outline ? 'on' : ''}" aria-pressed="${!!state.outline}">${ic('list', 15)}${T('Outline', 'Список')}</button>
    </div>`;
  return `<section class="project-whiteboard${state.focus ? ' is-focused' : ''}${state.presentationId ? ' is-presenting' : ''}" data-project="${esc(project.id)}" ${connectionSource ? 'data-connecting="true"' : ''} data-has-selection="${Boolean(selectedIds.length || state.selectedEdge)}" data-multi-select="${!!state.multiSelect}" aria-label="${T('Whiteboard canvas', 'Содержимое холста')}" translate="no">${mobileView}<div class="whiteboard-toolbar" id="whiteboard-edit-toolbar" role="group" aria-label="${T('Canvas editing tools', 'Инструменты редактирования холста')}">
  ${
    editable
      ? `<details class="ui-menu whiteboard-add" ${disclosureAttributes('whiteboard-add:' + project.id)}><summary class="btn btn-primary btn-sm" aria-label="${T('Add', 'Добавить')}">${ic('plus', 15)}<span>${T('Add', 'Добавить')}</span></summary><div>${[
          ['whiteboardNewText', 'sticky-note', 'Text card', 'Текстовая карточка'],
          ['whiteboardAddMaterial', 'file-plus', 'Linked material', 'Связанный материал'],
          ['whiteboardNewFrame', 'square-dashed', 'Frame', 'Рамка'],
          ['whiteboardNewShape', 'shapes', 'Shape', 'Фигура'],
          ['whiteboardUploadMedia', 'image', 'Image or PDF', 'Изображение или PDF'],
          ['whiteboardPaste', 'clipboard-paste', 'Paste link or text', 'Вставить ссылку или текст'],
          ['whiteboardAddWebsite', 'globe', 'Website', 'Сайт'],
          ['whiteboardNewEdge', 'move-right', 'Connection', 'Связь'],
        ]
          .map(([a, i, en, ru]) => `<button data-a="${a}">${ic(i, 15)}${T(en, ru)}</button>`)
          .join(
            '',
          )}<p class="hint whiteboard-add-hint">${T('Drop images or PDF onto the canvas. Ctrl/Cmd + V pastes images, links or text.', 'Перетащите изображения или PDF на холст. Ctrl/Cmd + V вставляет изображения, ссылки или текст.')}</p></div></details>${button('whiteboardUndo', 'undo-2', 'Undo', 'Отменить', state.undo.length ? '' : 'disabled')}`
      : `<span class="hint">${T('Read only', 'Только просмотр')}</span>`
  }
  ${button('whiteboardToggleSelection', 'square-check', 'Select cards', 'Выбрать карточки', `aria-pressed="${!!state.multiSelect}" ${state.multiSelect ? 'aria-describedby="whiteboard-multi-help"' : ''}`)}<span class="whiteboard-count">${stored.nodes.length} / 200 · ${C(stored.edges.length, 'connection')}</span><span class="sp"></span><button class="btn btn-secondary btn-sm whiteboard-view-toggle" data-a="whiteboardToggleOutline" aria-label="${state.outline ? T('Outline. Show canvas', 'Список. Показать холст') : T('Canvas. Show outline', 'Холст. Показать список')}" title="${state.outline ? T('Outline. Show canvas', 'Список. Показать холст') : T('Canvas. Show outline', 'Холст. Показать список')}">${ic(state.outline ? 'layout-dashboard' : 'list', 15)}<span>${state.outline ? T('Canvas', 'Холст') : T('Outline', 'Список')}</span></button>${state.outline ? '' : `${whiteboardNavigation(state, editable)}`}<button class="btn btn-secondary btn-sm whiteboard-focus-toggle" data-a="whiteboardToggleFocus" aria-label="${state.focus ? T('Exit focus', 'Выйти из фокуса') : T('Focus', 'Фокус')}" aria-pressed="${!!state.focus}">${ic(state.focus ? 'minimize' : 'maximize', 15)}<span>${state.focus ? T('Exit focus', 'Выйти') : T('Focus', 'Фокус')}</span></button><button class="ibtn whiteboard-tools" data-a="openWhiteboardTools" aria-label="${T('More tools', 'Другие инструменты')}" title="${T('More tools', 'Другие инструменты')}">${ic('ellipsis', 16)}</button>
  </div>${state.uploadingMedia ? `<div class="whiteboard-upload-status" role="status">${T('Uploading media…', 'Загружаем материалы…')}<button class="btn btn-ghost btn-sm" data-a="whiteboardUploadProgress">${T('Uploads', 'Загрузки')}</button></div>` : ''}<p id="whiteboard-help" class="sr">${state.outline ? T('Outline: choose a card to read or edit it. Connections are listed below.', 'Список: выберите карточку для чтения или изменения. Связи показаны ниже.') : whiteboardNavigationHint(navigationMode, editable)}</p>
  <span class="sr" role="status" data-whiteboard-layer-status></span>${whiteboardPresentationNavigation(board, state)}${connectionSource ? whiteboardConnectionControls(connectionSource, state.reconnect) : selectedIds.length > 1 ? groupSelectionToolbar(project.id, board, selectedIds, state, editable) : whiteboardContext(board, state, editable)}${state.multiSelect ? `<p class="${selectedIds.length ? 'sr' : 'whiteboard-multi-hint'}" id="whiteboard-multi-help">${selectionHelp}</p>` : ''}
  ${
    state.outline
      ? `<div class="whiteboard-outline" data-keep="whiteboard-outline:${esc(state.scope)}">${outlineHtml(board, editable, state, lockedIds)}<h3>${T('Connections', 'Связи')}</h3>${edgeList || `<p class="hint">${T('No connections yet.', 'Связей пока нет.')}</p>`}</div>`
      : `${layersOpen ? '<div class="whiteboard-board-area">' : ''}<div class="whiteboard-stage"><div class="whiteboard-viewport" role="region" data-overview="${state.zoom < 0.65}" data-navigation="${navigationMode}" tabindex="0" aria-label="${T('Whiteboard navigation', 'Навигация по холсту')}" aria-describedby="whiteboard-help"><div class="whiteboard-world" style="--whiteboard-zoom:${state.zoom};transform:translate(${state.x}px,${state.y}px) scale(${state.zoom})"><div class="whiteboard-saved-groups" aria-hidden="true">${savedWhiteboardGroups(board)}</div>${whiteboardEdges(board)}${whiteboardPaintOrder(
          board.nodes,
        )
          .map(n => whiteboardCard(n, editable, false, lockedIds.has(n.id)))
          .join(
            '',
          )}${groupSelectionBox(board, selectedIds, state, editable && !connectionSource)}${connectionHandles(board, state, editable)}<div class="whiteboard-guides" aria-hidden="true"></div></div><div class="whiteboard-marquee" aria-hidden="true" hidden></div>${!board.nodes.length ? empty : ''}${whiteboardMinimap(board, state)}</div><div class="whiteboard-navigation">${button('whiteboardPickFromList', 'search', 'Find card', 'Найти карточку')}${!state.presentationId ? button('whiteboardToggleLayers', 'layers', 'Layers', 'Слои', `aria-expanded="${layersOpen}" aria-controls="whiteboard-layers-panel"`) : ''}${button('whiteboardZoomOut', 'minus', 'Zoom out', 'Уменьшить')}<button class="whiteboard-scale" data-a="whiteboardResetZoom" aria-label="${T('Reset zoom', 'Сбросить масштаб')}">${Math.round(state.zoom * 100)}%</button>${button('whiteboardZoomIn', 'plus', 'Zoom in', 'Увеличить')}${button('whiteboardFit', 'scan', 'Fit all cards', 'Показать весь холст')}</div></div>${layersOpen ? whiteboardLayersPanel(stored, state, editable && !connectionSource) + '</div>' : ''}`
  }
  <details class="whiteboard-help"><summary>${T('Navigation and limits', 'Навигация и ограничения')}</summary><p>${T('Choose Pan to move the canvas, or Cards to move cards. Pinch or Ctrl + wheel to zoom. Use Outline on phones and keyboards. Boards support 200 cards and 400 connections. Changes use workspace synchronization; simultaneous editing of the same field may require conflict review.', 'Выберите режим «Холст» для панорамы или «Карточки» для их перемещения. Щипок или Ctrl + колесо — масштаб. На телефоне и с клавиатурой удобно работать в списке. До 200 карточек и 400 связей. Работает синхронизация пространства; одновременные изменения одного поля могут потребовать разрешения конфликта.')}</p><p>${T('On the canvas: double-click empty space to add text, or a card to edit/open it. T: text, F: frame, @: existing material. Hold Space and drag to pan temporarily. Shift + drag from empty space selects several cards. Use the + handle to connect cards; click a line to edit the connection. Shortcuts do not run while typing.', 'На холсте: двойной клик по пустому месту создаёт текст, по карточке — открывает её. T — текст, F — рамка, @ — существующий материал. Удерживайте пробел и тяните мышью для временной панорамы. Shift + перетаскивание с пустого места выделяет карточки рамкой. Маркер + соединяет карточки; клик по линии открывает связь. При вводе текста команды не выполняются.')}</p></details></section>`;
}
