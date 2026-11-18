import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { whiteboardLabel, wbText as T } from '../core/whiteboard-state.js';
import { BOARD_COLORS } from '../shared/project-whiteboard.js';

export function whiteboardContext(board, state, editable) {
  const edge = board.edges.find(edge => edge.id === state.selectedEdge),
    ids = state.selection?.length ? state.selection : state.selected ? [state.selected] : [],
    node = !edge && ids.length === 1 ? board.nodes.find(node => node.id === ids[0]) : null,
    item = edge || node;
  if (!item) return '';
  const kind = edge ? 'edge' : 'node',
    field = edge ? 'label' : 'title',
    draft = state.contextDrafts?.[kind + ':' + item.id],
    text = draft ? draft.value : item[field] || '',
    name = edge ? T('Connection', 'Связь') : whiteboardLabel(node),
    attrs = key =>
      `data-scope="${esc(state.scope)}" data-kind="${kind}" data-id="${esc(item.id)}" data-field="${key}" data-base="${esc(JSON.stringify(item[key]))}"`,
    action = (a, icon, label) =>
      `<button class="${a === 'whiteboardResizeFocus' ? 'btn btn-secondary btn-sm' : 'ibtn'}" data-a="${a}" data-id="${esc(item.id)}" aria-label="${esc(label)}" title="${esc(label)}">${ic(icon, 16)}${a === 'whiteboardResizeFocus' ? esc(label) : ''}</button>`,
    colors = [T('Neutral', 'Нейтральный'), T('Violet', 'Фиолетовый'), T('Blue', 'Синий'), T('Green', 'Зелёный'), T('Amber', 'Янтарный'), T('Rose', 'Розовый')];
  const title =
    editable && (edge || node.type !== 'material')
      ? `<form class="whiteboard-context-title" data-submit="whiteboardContextApply" data-scope="${esc(state.scope)}" data-kind="${kind}" data-id="${esc(item.id)}"><input class="input" maxlength="120" value="${esc(text)}" aria-label="${T(edge ? 'Connection label' : 'Card title', edge ? 'Подпись связи' : 'Название карточки')}" data-in="whiteboardContextText" ${attrs(field)}><button class="ibtn" type="submit" aria-label="${T('Save title', 'Сохранить название')}" title="${T('Save title', 'Сохранить название')}" ${draft ? '' : 'hidden'}>${ic('check', 16)}</button><button class="ibtn" type="button" data-a="whiteboardContextCancel" aria-label="${T('Discard title draft', 'Отменить изменение названия')}" ${draft ? '' : 'hidden'}>${ic('undo-2', 16)}</button></form>`
      : `<strong class="trunc" translate="no">${esc(name)}</strong>`;
  return `<aside class="whiteboard-context" aria-label="${T('Selection tools', 'Инструменты выделения')}" translate="no"><span class="whiteboard-context-kind" title="${esc(name)}">${ic(edge ? 'move-right' : node.type === 'material' ? 'file-text' : node.type === 'group' ? 'square-dashed' : 'sticky-note', 16)}</span>${title}${node ? `<p class="whiteboard-overview-selection" translate="no">${esc(name)}</p>` : ''}<div class="whiteboard-context-actions">${node ? action('whiteboardReadCard', 'book-open', T('Read fully', '\u0427\u0438\u0442\u0430\u0442\u044c \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e')) : ''}${editable ? `<select class="select" data-in="whiteboardContextField" aria-label="${T('Color', 'Цвет')}" ${attrs('color')}>${BOARD_COLORS.map((color, i) => `<option value="${color}" ${item.color === color ? 'selected' : ''}>${colors[i]}</option>`).join('')}</select>${edge ? `<button class="ibtn" data-a="whiteboardContextArrow" aria-pressed="${edge.arrow}" aria-label="${T('Arrow', 'Стрелка')}" ${attrs('arrow')}>${ic('move-right', 16)}</button>${action('whiteboardEditEdge', 'sliders-horizontal', T('Connection settings', 'Настройки связи'))}` : `${action('whiteboardResizeFocus', 'scaling', T('Resize card', 'Изменить размер'))}${action('whiteboardConnectStart', 'plus', T('Connect card', 'Связать карточку'))}${action('whiteboardEdit', 'pencil', T('Edit text and settings', 'Изменить текст и настройки'))}${['text', 'shape'].includes(node.type) ? action('whiteboardExtract', 'file-plus', T('Create from card text', 'Создать из текста карточки')) : ''}`}` : ''}${node?.type === 'material' ? `<button class="ibtn" data-a="openRelatedEntity" data-key="${esc(node.target)}" aria-label="${T('Open material', 'Открыть материал')}">${ic('arrow-up-right', 16)}</button>` : ''}${action('whiteboardDeselect', 'x', T('Clear selection', 'Снять выделение'))}</div></aside>`;
}

export function whiteboardNavigationHint(mode, editable) {
  return mode === 'pan'
    ? T('Pan: drag to move the canvas without moving cards.', 'Холст: перетаскивайте поле, не перемещая карточки.')
    : mode === 'move'
      ? editable
        ? T('Cards: drag a card title to move it.', 'Карточки: перемещайте карточку за заголовок.')
        : T('Select: choose cards to read them. This board is read-only.', 'Выбор: выбирайте карточки для чтения. Холст доступен только для просмотра.')
      : T('Scroll: swipe to scroll the page. Cards stay in place.', 'Прокрутка: листайте страницу. Карточки остаются на месте.');
}
export function whiteboardNavigation(state, editable) {
  const hint = whiteboardNavigationHint(state.navigationMode, editable);
  return `<label class="whiteboard-gesture" title="${esc(hint)}"><span class="sr">${T('Interaction mode', 'Режим управления')}</span><select class="select" data-in="whiteboardNavigation" aria-label="${T('Interaction mode', 'Режим управления')}" aria-describedby="whiteboard-mode-hint" title="${esc(hint)}">${[
    ['scroll', T('Scroll', 'Прокрутка')],
    ['pan', T('Pan', 'Холст')],
    ['move', editable ? T('Cards', 'Карточки') : T('Select', 'Выбор')],
  ]
    .map(([mode, label]) => `<option value="${mode}" ${state.navigationMode === mode ? 'selected' : ''}>${label}</option>`)
    .join('')}</select><span class="sr" id="whiteboard-mode-hint">${esc(hint)}</span></label>`;
}
