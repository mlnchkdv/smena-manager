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
      `<button class="ibtn" data-a="${a}" data-id="${esc(item.id)}" aria-label="${esc(label)}" title="${esc(label)}">${ic(icon, 16)}</button>`,
    colors = [T('Neutral', 'Нейтральный'), T('Violet', 'Фиолетовый'), T('Blue', 'Синий'), T('Green', 'Зелёный'), T('Amber', 'Янтарный'), T('Rose', 'Розовый')];
  const title =
    editable && (edge || node.type !== 'material')
      ? `<form class="whiteboard-context-title" data-submit="whiteboardContextApply" data-scope="${esc(state.scope)}" data-kind="${kind}" data-id="${esc(item.id)}"><input class="input" maxlength="120" value="${esc(text)}" aria-label="${T(edge ? 'Connection label' : 'Card title', edge ? 'Подпись связи' : 'Название карточки')}" data-in="whiteboardContextText" ${attrs(field)}><button class="ibtn" type="submit" aria-label="${T('Save title', 'Сохранить название')}" title="${T('Save title', 'Сохранить название')}" ${draft ? '' : 'hidden'}>${ic('check', 16)}</button><button class="ibtn" type="button" data-a="whiteboardContextCancel" aria-label="${T('Discard title draft', 'Отменить изменение названия')}" ${draft ? '' : 'hidden'}>${ic('undo-2', 16)}</button></form>`
      : `<strong class="trunc" translate="no">${esc(name)}</strong>`;
  return `<aside class="whiteboard-context" aria-label="${T('Selection tools', 'Инструменты выделения')}" translate="no"><span class="whiteboard-context-kind" title="${esc(name)}">${ic(edge ? 'move-right' : node.type === 'material' ? 'file-text' : node.type === 'group' ? 'square-dashed' : 'sticky-note', 16)}</span>${title}<div class="whiteboard-context-actions">${editable ? `<select class="select" data-in="whiteboardContextField" aria-label="${T('Color', 'Цвет')}" ${attrs('color')}>${BOARD_COLORS.map((color, i) => `<option value="${color}" ${item.color === color ? 'selected' : ''}>${colors[i]}</option>`).join('')}</select>${edge ? `<button class="ibtn" data-a="whiteboardContextArrow" aria-pressed="${edge.arrow}" aria-label="${T('Arrow', 'Стрелка')}" ${attrs('arrow')}>${ic('move-right', 16)}</button>${action('whiteboardEditEdge', 'sliders-horizontal', T('Connection settings', 'Настройки связи'))}` : `${action('whiteboardResizeFocus', 'scaling', T('Zoom to resize', 'Приблизить для изменения размера'))}${action('whiteboardConnectStart', 'plus', T('Connect card', 'Связать карточку'))}${action('whiteboardEdit', 'pencil', T('Edit text and settings', 'Изменить текст и настройки'))}${['text', 'shape'].includes(node.type) ? action('whiteboardExtract', 'file-plus', T('Create from card text', 'Создать из текста карточки')) : ''}`}` : ''}${node?.type === 'material' ? `<button class="ibtn" data-a="openRelatedEntity" data-key="${esc(node.target)}" aria-label="${T('Open material', 'Открыть материал')}">${ic('arrow-up-right', 16)}</button>` : ''}${action('whiteboardDeselect', 'x', T('Clear selection', 'Снять выделение'))}</div></aside>`;
}

export function whiteboardNavigation(state, editable) {
  return `<label class="whiteboard-gesture"><span class="sr">${T('Interaction mode', 'Режим управления')}</span><select class="select" data-in="whiteboardNavigation" aria-label="${T('Interaction mode', 'Режим управления')}">${[
    ['scroll', T('Page scroll', 'Прокрутка')],
    ['pan', T('Pan canvas', 'Панорама')],
    ['move', editable ? T('Move cards', 'Карточки') : T('Select cards', 'Выбор')],
  ]
    .map(([mode, label]) => `<option value="${mode}" ${state.navigationMode === mode ? 'selected' : ''}>${label}</option>`)
    .join('')}</select></label>`;
}
