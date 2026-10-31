import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { canEditProject } from '../shared/project-access.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { whiteboardLabel, whiteboardMaterial, whiteboardState, wbText as T } from '../core/whiteboard-state.js';
const button = (action, icon, en, ru, extra = '') =>
  `<button class="ibtn" data-a="${action}" aria-label="${esc(T(en, ru))}" title="${esc(T(en, ru))}" ${extra}>${ic(icon, 16)}</button>`;
const icons = { text: 'sticky-note', material: 'file-text', group: 'square-dashed' };
export function whiteboardCard(node, editable, outline = false) {
  const label = esc(whiteboardLabel(node)),
    state = whiteboardState();
  const material = node.type === 'material' ? whiteboardMaterial(node) : null;
  return `<article class="whiteboard-card ${state.selected === node.id ? 'selected' : ''} ${outline ? 'in-outline' : ''}" data-board-id="${esc(node.id)}" data-kind="${node.type}" data-color="${node.color}" aria-label="${label}" ${outline ? '' : `style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"`}>
    <div class="whiteboard-card-head"><button class="whiteboard-drag" data-board-drag="${esc(node.id)}" data-a="whiteboardSelect" data-id="${esc(node.id)}" aria-label="${esc(T('Select card', 'Выбрать карточку'))}: ${label}" aria-describedby="whiteboard-help">${ic(icons[node.type], 15)}<strong>${label}</strong></button>${editable ? button('whiteboardEdit', 'pencil', 'Edit card', 'Изменить карточку', `data-id="${esc(node.id)}"`) : ''}</div>
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
    editable = !project.archived && canEditProject(project, D().me, S.ui.currentUser?.role);
  const edgeList = board.edges
    .map(
      edge =>
        `<button class="whiteboard-edge-row" data-a="whiteboardEditEdge" data-id="${esc(edge.id)}">${ic('move-right', 14)}<span>${esc(whiteboardLabel(board.nodes.find(n => n.id === edge.from)))} → ${esc(whiteboardLabel(board.nodes.find(n => n.id === edge.to)))}</span><small>${esc(edge.label)}</small></button>`,
    )
    .join('');
  return `<section class="project-whiteboard" data-project="${esc(project.id)}" aria-label="${T('Project whiteboard', 'Холст проекта')}" translate="no"><div class="whiteboard-toolbar">
  ${
    editable
      ? `<details class="ui-menu whiteboard-add"><summary class="btn btn-primary btn-sm">${ic('plus', 15)}${T('Add', 'Добавить')}</summary><div>${[
          ['whiteboardNewText', 'sticky-note', 'Text card', 'Текстовая карточка'],
          ['whiteboardAddMaterial', 'file-plus', 'Linked material', 'Связанный материал'],
          ['whiteboardNewFrame', 'square-dashed', 'Frame', 'Рамка'],
          ['whiteboardNewEdge', 'move-right', 'Connection', 'Связь'],
        ]
          .map(([a, i, en, ru]) => `<button data-a="${a}">${ic(i, 15)}${T(en, ru)}</button>`)
          .join(
            '',
          )}</div></details>${button('whiteboardUndo', 'undo-2', 'Undo', 'Отменить', state.undo.length ? '' : 'disabled')}${button('whiteboardRedo', 'redo-2', 'Redo', 'Повторить', state.redo.length ? '' : 'disabled')}`
      : `<span class="hint">${T('Read only', 'Только просмотр')}</span>`
  }
  <span class="whiteboard-count">${board.nodes.length} / 200 · ${board.edges.length} ${T('connections', 'связей')}</span><span class="sp"></span><button class="btn btn-secondary btn-sm" data-a="whiteboardToggleOutline" aria-pressed="${state.outline}">${ic(state.outline ? 'layout-dashboard' : 'list', 15)}${state.outline ? T('Canvas', 'Холст') : T('Outline', 'Список')}</button>${button('whiteboardExport', 'download', 'Download board JSON', 'Скачать JSON холста')}
  </div><p id="whiteboard-help" class="sr">${T('Move cards by their title. Drag empty space to pan; pinch or Ctrl + wheel to zoom. Arrow keys on a selected card move it. Outline mode lists every card and connection.', 'Перемещайте карточки за заголовок. Пустое место — панорама; щипок или Ctrl + колесо — масштаб. Стрелки на выбранной карточке перемещают её. В списке доступны все карточки и связи.')}</p>
  ${
    state.outline
      ? `<div class="whiteboard-outline">${board.nodes.map(n => whiteboardCard(n, editable, true)).join('') || `<p class="hint">${T('No cards yet. Add your first idea or material.', 'Карточек пока нет. Добавьте идею или материал.')}</p>`}<h3>${T('Connections', 'Связи')}</h3>${edgeList || `<p class="hint">${T('No connections yet.', 'Связей пока нет.')}</p>`}</div>`
      : `<div class="whiteboard-viewport" tabindex="0" aria-label="${T('Whiteboard navigation', 'Навигация по холсту')}" aria-describedby="whiteboard-help"><div class="whiteboard-world" style="transform:translate(${state.x}px,${state.y}px) scale(${state.zoom})">${whiteboardEdges(board)}${[
          ...board.nodes,
        ]
          .sort((a, b) => (a.type !== 'group') - (b.type !== 'group'))
          .map(n => whiteboardCard(n, editable))
          .join(
            '',
          )}</div>${!board.nodes.length ? `<div class="whiteboard-empty">${ic('layout-dashboard', 32)}<h2>${T('Give your ideas room', 'Разложите идеи по местам')}</h2><p>${T('Arrange cards and project materials, then connect them.', 'Разместите карточки и материалы проекта, затем свяжите их.')}</p>${editable ? `<button class="btn btn-primary btn-sm" data-a="whiteboardNewText">${ic('plus', 15)}${T('First card', 'Первая карточка')}</button>` : ''}</div>` : ''}<div class="whiteboard-navigation">${button('whiteboardZoomOut', 'minus', 'Zoom out', 'Уменьшить')}<button class="whiteboard-scale" data-a="whiteboardResetZoom" aria-label="${T('Reset zoom', 'Сбросить масштаб')}">${Math.round(state.zoom * 100)}%</button>${button('whiteboardZoomIn', 'plus', 'Zoom in', 'Увеличить')}${button('whiteboardFit', 'scan', 'Fit all cards', 'Показать весь холст')}</div></div>`
  }
  ${state.selected ? `<div class="whiteboard-selection"><span class="trunc">${esc(whiteboardLabel(board.nodes.find(n => n.id === state.selected) || { type: 'text' }))}</span>${editable ? `${button('whiteboardEdit', 'pencil', 'Edit card', 'Изменить карточку')}${button('whiteboardNewEdge', 'move-right', 'Connect card', 'Связать карточку')}${button('whiteboardDuplicate', 'copy', 'Duplicate card', 'Дублировать карточку')}${button('whiteboardDelete', 'trash-2', 'Remove card', 'Убрать карточку')}` : ''}${button('whiteboardDeselect', 'x', 'Clear selection', 'Снять выделение')}</div>` : ''}
  <details class="whiteboard-help"><summary>${T('Navigation and limits', 'Навигация и ограничения')}</summary><p>${T('Drag empty space to pan. Pinch or Ctrl + wheel to zoom. Use Outline on phones and keyboards. Boards support 200 cards and 400 connections. Changes use workspace synchronization; simultaneous editing of the same field may require conflict review.', 'Пустое место — панорама. Щипок или Ctrl + колесо — масштаб. На телефоне и с клавиатурой удобно работать в списке. До 200 карточек и 400 связей. Работает синхронизация пространства; одновременные изменения одного поля могут потребовать разрешения конфликта.')}</p></details></section>`;
}
