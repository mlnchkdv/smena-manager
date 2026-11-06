import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { currentWhiteboard, whiteboardState, whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { ic } from '../core/icons.js';
import { diagramViewsControl } from '../ui/diagram-views.js';
import { whiteboardPortableControl } from '../ui/whiteboard-portable.js';
import '../styles/whiteboard-tools.css';

const toggles = new Set(['whiteboardToggleMinimap', 'whiteboardToggleAspect', 'whiteboardToggleGuides']);
const commands = new Set([
  ...toggles,
  'whiteboardRedo',
  'whiteboardPaste',
  'whiteboardHistory',
  'saveDiagramView',
  'resetDiagramView',
  'loadDiagramView',
  'removeDiagramView',
  'whiteboardExport',
  'whiteboardExportCanvas',
  'whiteboardImport',
]);
A.openWhiteboardTools = () => {
  const board = currentWhiteboard();
  if (!board) return;
  const scope = whiteboardScope(board.id);
  openModal({
    type: 'whiteboardTool',
    boardTools: true,
    project: board.id,
    scope,
    render: (_modal, H) => {
      if (currentWhiteboard()?.id !== board.id || whiteboardScope(board.id) !== scope) return H(T('Whiteboard unavailable', 'Холст недоступен'));
      const state = whiteboardState(board.id),
        editable = !board.archived && canEditWhiteboard(D(), board, D().me, S.ui.currentUser?.role);
      const command = (action, icon, en, ru, extra = '') => `<button class="btn btn-ghost" data-a="${action}" ${extra}>${ic(icon, 16)}${T(en, ru)}</button>`;
      const content = `<section class="diagram-tools-section"><h3>${T('Canvas options', 'Параметры холста')}</h3>${command('whiteboardToggleMinimap', 'map', 'Minimap', 'Миникарта', `aria-pressed="${!!state.minimap}"`)}${command('whiteboardToggleAspect', 'ratio', 'Keep proportions (corners)', 'Сохранять пропорции (углы)', `aria-pressed="${!!state.resizeAspect}"`)}${command('whiteboardToggleGuides', 'scan-line', 'Alignment guides', 'Направляющие', `aria-pressed="${!!state.resizeGuides}"`)}</section><section class="diagram-tools-section"><h3>${T('Editing and history', 'Правки и история')}</h3>${editable ? command('whiteboardRedo', 'redo-2', 'Redo', 'Повторить', state.redo.length ? '' : 'disabled') + command('whiteboardPaste', 'clipboard-paste', 'Paste cards', 'Вставить карточки') : ''}${command('whiteboardHistory', 'history', 'Whiteboard history', 'История холста')}</section>${diagramViewsControl('board', board.id, true)}${whiteboardPortableControl(editable, true)}`;
      return `${H(T('Whiteboard tools', 'Инструменты холста'))}<div class="modal-b whiteboard-tools-dialog" translate="no">${content.replace(/data-a="([^"]+)"/g, 'data-a="whiteboardToolAction" data-command="$1"')}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button></div>`;
    },
  });
};
A.whiteboardToolAction = el => {
  const modal = S.ui.modals.at(-1),
    action = el.dataset.command;
  if (!modal?.boardTools || modal.project !== currentWhiteboard()?.id || modal.scope !== whiteboardScope(modal.project) || !commands.has(action)) return;
  if (!toggles.has(action)) closeModal();
  return A[action]?.(el);
};
