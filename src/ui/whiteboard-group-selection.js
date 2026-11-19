import { ic } from '../core/icons.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { whiteboardBounds } from '../shared/project-whiteboard.js';
import { groupResizeNodes } from '../shared/whiteboard-group-resize.js';
import { whiteboardSelectionNodes } from '../shared/whiteboard-selection.js';
import { disclosureAttributes } from './disclosure.js';

const alignments = [
  ['left', 'align-start-vertical', 'Align left', 'По левому краю'],
  ['center-x', 'align-center-vertical', 'Center horizontally', 'По центру по горизонтали'],
  ['right', 'align-end-vertical', 'Align right', 'По правому краю'],
  ['top', 'align-start-horizontal', 'Align top', 'По верхнему краю'],
  ['center-y', 'align-center-horizontal', 'Center vertically', 'По центру по вертикали'],
  ['bottom', 'align-end-horizontal', 'Align bottom', 'По нижнему краю'],
  ['distribute-x', 'align-horizontal-distribute-center', 'Distribute horizontally', 'Равные интервалы по горизонтали'],
  ['distribute-y', 'align-vertical-distribute-center', 'Distribute vertically', 'Равные интервалы по вертикали'],
];

export function groupSelectionToolbar(projectId, ids, state, editable) {
  const count = T(`Selected: ${ids.length}`, `Выбрано: ${ids.length}`);
  const button = (action, icon, name, extra = '') =>
    `<button type="button" class="ibtn" data-a="${action}" aria-label="${name}" title="${name}" ${extra}>${ic(icon, 16)}</button>`;
  const menuItem = (action, icon, name, extra = '') => `<button type="button" data-a="${action}" ${extra}>${ic(icon, 16)}<span>${name}</span></button>`;
  const arrange = editable
    ? `<details class="ui-menu whiteboard-context-menu whiteboard-arrange" ${disclosureAttributes('whiteboard-arrange:' + projectId)}><summary class="btn btn-secondary btn-sm" aria-label="${T('Arrange cards', 'Выровнять карточки')}">${ic('align-start-vertical', 16)}<span>${T('Align', 'Выровнять')}</span></summary><div>${alignments.map(([mode, icon, en, ru]) => menuItem('whiteboardArrange', icon, T(en, ru), `data-mode="${mode}" ${mode.startsWith('distribute') && ids.length < 3 ? 'disabled' : ''}`)).join('')}${ids.length === 2 ? `<p class="hint">${T('Select at least three cards for equal spacing.', 'Для равных интервалов выделите хотя бы три карточки.')}</p>` : ''}</div></details>`
    : '';
  const more = `<details class="ui-menu whiteboard-context-menu" ${disclosureAttributes('whiteboard-group-tools:' + projectId)}><summary class="ibtn" aria-label="${T('Selection actions', 'Действия с выделением')}">${ic('ellipsis', 16)}</summary><div>${menuItem('whiteboardCopy', 'copy', T('Copy cards', 'Копировать карточки'))}${
    editable
      ? `${!state.outline ? menuItem('whiteboardGroupResize', 'scaling', T('Resize selection by its edges', 'Изменять выделение за края'), `aria-pressed="${!!state.resizeSelection}"`) + menuItem('whiteboardGroupContents', 'square-dashed', T('Also scale frame contents', 'Также менять содержимое рамок'), `aria-pressed="${!!state.resizeContents}"`) : ''}${menuItem('whiteboardEdit', 'pencil', T('Edit active card', 'Изменить активную карточку'))}${menuItem('whiteboardNewEdge', 'move-right', T('Connect cards', 'Связать карточки'))}${menuItem('whiteboardDelete', 'trash-2', T('Remove cards', 'Убрать карточки'))}`
      : ''
  }</div></details>`;
  return `<div class="whiteboard-selection" role="group" aria-label="${T('Group selection tools', 'Инструменты группового выделения')}"><span class="whiteboard-selection-count" title="${count}"><span role="status">${count}</span><span class="whiteboard-selection-number" aria-hidden="true">${ids.length}</span></span>${arrange}${button('whiteboardFocusSelection', 'scan', T('Show selected cards', 'Показать выделение'))}${more}${button('whiteboardDeselect', 'x', T('Clear selection', 'Снять выделение'))}</div>`;
}

export function groupSelectionBox(board, ids, state, editable) {
  if (!editable || ids.length < 2) return '';
  const resize = state.resizeSelection;
  const nodes = resize ? groupResizeNodes(board, ids, !!state.resizeContents) : whiteboardSelectionNodes(board, ids);
  const bounds = whiteboardBounds({ nodes });
  const label = T('Move selection', 'Переместить выделение');
  const handles = resize
    ? ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
        .map(
          direction =>
            `<button class="whiteboard-resize" data-board-resize="${direction}" data-board-group-resize="${direction}" tabindex="${direction === 'se' ? 0 : -1}" aria-label="${T('Resize selection', 'Изменить размер выделения')} (${direction.toUpperCase()})"></button>`,
        )
        .join('')
    : '';
  return `<div class="whiteboard-group-resize-box" data-group-resize-box style="left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px"><button type="button" class="whiteboard-group-move" id="whiteboard-group-move" data-board-move-group aria-label="${label}" aria-describedby="whiteboard-group-move-help" title="${label}">${ic('move', 16)}</button><span class="sr" id="whiteboard-group-move-help">${T('Drag to move the selection. Arrow keys move it; Shift makes larger steps.', 'Перетащите выделение или перемещайте его стрелками. Shift увеличивает шаг.')}</span>${handles}</div>`;
}
