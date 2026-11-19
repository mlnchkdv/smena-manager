import { ic } from '../core/icons.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { whiteboardBounds, whiteboardLockedIds } from '../shared/project-whiteboard.js';
import { groupResizeNodes } from '../shared/whiteboard-group-resize.js';
import {
  canGroupWhiteboardSelection,
  movableWhiteboardNodes,
  whiteboardGroupsInSelection,
  whiteboardSelectionNodes,
  whiteboardSelectionUnits,
} from '../shared/whiteboard-selection.js';
import { disclosureAttributes } from './disclosure.js';
import { whiteboardLayerActions } from './whiteboard-layer-actions.js';

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

export function groupSelectionToolbar(projectId, board, ids, state, editable) {
  const units = whiteboardSelectionUnits(board, ids);
  const groups = whiteboardGroupsInSelection(board, ids);
  const singleGroup = units.length === 1;
  const canMove = movableWhiteboardNodes(board, ids).length > 0;
  const locked = whiteboardLockedIds(board);
  const canResize = !groupResizeNodes(board, ids, !!state.resizeContents).some(node => locked.has(node.id));
  const selection = singleGroup ? T(`Group · ${ids.length}`, `Группа · ${ids.length}`) : T(`Selected: ${ids.length}`, `Выбрано: ${ids.length}`);
  const count = canMove ? selection : selection + ' · ' + T('Movement locked', 'Перемещение заблокировано');
  const button = (action, icon, name, extra = '') =>
    `<button type="button" class="ibtn" data-a="${action}" aria-label="${name}" title="${name}" ${extra}>${ic(icon, 16)}</button>`;
  const menuItem = (action, icon, name, extra = '') => `<button type="button" data-a="${action}" ${extra}>${ic(icon, 16)}<span>${name}</span></button>`;
  const arrange =
    editable && canMove && units.length > 1
      ? `<details class="ui-menu whiteboard-context-menu whiteboard-arrange" ${disclosureAttributes('whiteboard-arrange:' + projectId)}><summary class="btn btn-secondary btn-sm" aria-label="${T('Arrange cards', 'Выровнять карточки')}">${ic('align-start-vertical', 16)}<span>${T('Align', 'Выровнять')}</span></summary><div>${alignments.map(([mode, icon, en, ru]) => menuItem('whiteboardArrange', icon, T(en, ru), `data-mode="${mode}" ${mode.startsWith('distribute') && units.length < 3 ? 'disabled' : ''}`)).join('')}${units.length === 2 ? `<p class="hint">${T('Select at least three cards or groups for equal spacing.', 'Для равных интервалов выделите хотя бы три карточки или группы.')}</p>` : ''}</div></details>`
      : '';
  const group = T('Group cards', 'Сгруппировать'),
    ungroup = T('Ungroup cards', 'Разгруппировать');
  const canGroup = editable && canGroupWhiteboardSelection(board, ids, units);
  const canUngroup = editable && groups.some(group => !group.locked);
  const lockAction =
    editable && singleGroup
      ? button(
          'whiteboardPositionLock',
          canMove ? 'lock-keyhole' : 'lock-open',
          canMove ? T('Lock group position', 'Зафиксировать группу') : T('Unlock group position', 'Разблокировать группу'),
          `data-group-lock data-locked="${canMove}"`,
        )
      : '';
  const primary =
    canGroup || canUngroup
      ? `<button class="btn btn-secondary btn-sm whiteboard-group-action" type="button" data-a="${canGroup ? 'whiteboardGroupSelection' : 'whiteboardUngroupSelection'}" title="${canGroup ? group : ungroup}" aria-label="${canGroup ? group : ungroup}">${ic(canGroup ? 'group' : 'ungroup', 16)}<span>${canGroup ? group : ungroup}</span></button>`
      : '';
  const more = `<details class="ui-menu whiteboard-context-menu" ${disclosureAttributes('whiteboard-group-tools:' + projectId)}><summary class="ibtn" aria-label="${T('Selection actions', 'Действия с выделением')}">${ic('ellipsis', 16)}</summary><div>${editable ? whiteboardLayerActions(board, ids) : ''}${menuItem('whiteboardCopy', 'copy', T('Copy cards', 'Копировать карточки'))}${
    editable
      ? `${!state.outline && canResize ? menuItem('whiteboardGroupResize', 'scaling', T('Resize selection by its edges', 'Изменять выделение за края'), `aria-pressed="${!!state.resizeSelection}"`) : ''}${!state.outline && units.some(nodes => nodes[0].type === 'group') ? menuItem('whiteboardGroupContents', 'square-dashed', T('Also scale frame contents', 'Также менять содержимое рамок'), `aria-pressed="${!!state.resizeContents}"`) : ''}${menuItem('whiteboardEdit', 'pencil', T('Edit active card', 'Изменить активную карточку'))}${menuItem('whiteboardNewEdge', 'move-right', T('Connect cards', 'Связать карточки'))}${menuItem('whiteboardDelete', 'trash-2', T('Remove cards', 'Убрать карточки'))}`
      : ''
  }${canGroup && canUngroup ? menuItem('whiteboardUngroupSelection', 'ungroup', ungroup) : ''}</div></details>`;
  return `<div class="whiteboard-selection" role="group" aria-label="${T('Group selection tools', 'Инструменты группового выделения')}"><span class="whiteboard-selection-count" title="${count}"><span role="status">${count}</span><span class="whiteboard-selection-number" aria-hidden="true">${!canMove ? ic('lock-keyhole', 14) : singleGroup ? ic('group', 14) : ''}${ids.length}</span></span>${primary}${lockAction}${arrange}${button('whiteboardFocusSelection', 'scan', T('Show selected cards', 'Показать выделение'))}${more}${button('whiteboardDeselect', 'x', T('Clear selection', 'Снять выделение'))}</div>`;
}

export function savedWhiteboardGroups(board) {
  if (!board.groups?.length) return '';
  const nodes = new Map(board.nodes.map(node => [node.id, node]));
  return board.groups
    .map(group => {
      const { x, y, width, height } = whiteboardBounds({ nodes: group.members.map(id => nodes.get(id)).filter(Boolean) });
      return `<div class="whiteboard-saved-group" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"></div>`;
    })
    .join('');
}

export function groupSelectionBox(board, ids, state, editable) {
  if (!editable || ids.length < 2) return '';
  const canMove = movableWhiteboardNodes(board, ids).length > 0;
  const resizeNodes = state.resizeSelection ? groupResizeNodes(board, ids, !!state.resizeContents) : [];
  const locked = whiteboardLockedIds(board);
  const resize = resizeNodes.length > 0 && !resizeNodes.some(node => locked.has(node.id));
  const nodes = resize ? resizeNodes : whiteboardSelectionNodes(board, ids);
  const bounds = whiteboardBounds({ nodes });
  const singleGroup = whiteboardGroupsInSelection(board, ids).some(group => group.members.length === ids.length);
  const label = singleGroup ? T('Move group', 'Переместить группу') : T('Move selection', 'Переместить выделение');
  const handles = resize
    ? ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
        .map(
          direction =>
            `<button class="whiteboard-resize" data-board-resize="${direction}" data-board-group-resize="${direction}" tabindex="${direction === 'se' ? 0 : -1}" aria-label="${T('Resize selection', 'Изменить размер выделения')} (${direction.toUpperCase()})"></button>`,
        )
        .join('')
    : '';
  return `<div class="whiteboard-group-resize-box" data-group-resize-box ${singleGroup ? 'data-saved-selection' : ''} style="left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px">${canMove ? `<button type="button" class="whiteboard-group-move" id="whiteboard-group-move" data-board-move-group aria-label="${label}" aria-describedby="whiteboard-group-move-help" title="${label}">${ic('move', 16)}</button><span class="sr" id="whiteboard-group-move-help">${T('Drag to move the selection. Arrow keys move it; Shift makes larger steps.', 'Перетащите выделение или перемещайте его стрелками. Shift увеличивает шаг.')}</span>` : ''}${handles}</div>`;
}
