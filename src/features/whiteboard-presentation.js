import { A } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { currentWhiteboard, whiteboardScope, whiteboardState, wbText as T } from '../core/whiteboard-state.js';
import { canReadWhiteboard, canEditWhiteboard } from '../shared/whiteboards.js';
import { whiteboardOf } from '../shared/project-whiteboard.js';
import { whiteboardFrames, reorderWhiteboardFrame } from '../shared/whiteboard-presentation.js';
import { whiteboardCommand } from './project-whiteboard.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { syncDiagramWindow } from '../ui/diagram-window.js';
const active = () => {
  const m = S.ui.modals.at(-1);
  return m?.presentBoard && m.scope === whiteboardScope(m.project) && currentWhiteboard()?.id === m.project ? m : null;
};
const readable = () => {
  const document = currentWhiteboard();
  return document && canReadWhiteboard(D(), document, D().me, S.ui.currentUser?.role) ? document : null;
};
A.whiteboardPresentation = () => {
  const document = readable();
  if (!document) return;
  openModal({
    type: 'whiteboardTool',
    presentBoard: true,
    project: document.id,
    scope: whiteboardScope(document.id),
    render: (m, H) => {
      if (!active()) return H(T('Canvas unavailable', 'Холст недоступен'));
      const board = whiteboardOf(currentWhiteboard()),
        frames = whiteboardFrames(board),
        editable = !currentWhiteboard().archived && canEditWhiteboard(D(), currentWhiteboard(), D().me, S.ui.currentUser?.role);
      return `${H(T('Frame presentation', 'Разбор рамок'))}<div class="modal-b" translate="no"><p class="hint">${T('Choose a frame to present it. Left/Right moves between frames; Escape returns to your previous view. Presenting does not edit cards.', 'Выберите рамку для показа. Влево/вправо — переход между рамками, Escape — возврат к прежнему виду. Во время показа карточки не редактируются.')}</p><ol class="whiteboard-frame-order">${frames.map((frame, index) => `<li><button class="btn btn-ghost" data-a="whiteboardPresentStart" data-id="${esc(frame.id)}"><span>${index + 1}.</span><span class="trunc" translate="no">${esc(frame.title || T('Untitled frame', 'Рамка без названия'))}</span></button>${editable ? `<button class="ibtn" data-a="whiteboardFrameOrder" data-id="${esc(frame.id)}" data-dir="-1" aria-label="${T('Move frame up', 'Поднять рамку')}: ${esc(frame.title)}" ${index === 0 ? 'disabled' : ''}>${ic('arrow-up', 16)}</button><button class="ibtn" data-a="whiteboardFrameOrder" data-id="${esc(frame.id)}" data-dir="1" aria-label="${T('Move frame down', 'Опустить рамку')}: ${esc(frame.title)}" ${index === frames.length - 1 ? 'disabled' : ''}>${ic('arrow-down', 16)}</button>` : ''}</li>`).join('')}</ol>${frames.length ? '' : `<p>${T('Add a frame from the canvas Add menu first.', 'Сначала добавьте рамку через меню «Добавить» на холсте.')}</p>`}</div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Close', 'Закрыть')}</button></div>`;
    },
  });
};
A.whiteboardFrameOrder = el => {
  const m = active(),
    document = readable();
  if (!m || !document) return;
  if (!document.archived && canEditWhiteboard(D(), document, D().me, S.ui.currentUser?.role))
    whiteboardCommand(board => reorderWhiteboardFrame(board, el.dataset.id, Number(el.dataset.dir)));
};
A.whiteboardPresentStart = el => {
  const document = readable(),
    m = active();
  if (!document || !m) return;
  if (!whiteboardFrames(whiteboardOf(document)).some(frame => frame.id === el.dataset.id)) return;
  const state = whiteboardState();
  state.presentationBefore = Object.fromEntries(
    ['x', 'y', 'zoom', 'focus', 'outline', 'selected', 'selectedEdge', 'selection', 'fit', 'autoFit'].map(key => [key, structuredClone(state[key])]),
  );
  state.presentationId = el.dataset.id;
  state.focus = true;
  state.connectFrom = '';
  state.reconnect = null;
  closeModal();
  syncDiagramWindow();
  A.whiteboardLocate({ dataset: { id: state.presentationId } });
};
A.whiteboardPresentStep = el => {
  const document = readable(),
    state = whiteboardState();
  if (!document || !state.presentationId || ![-1, 1].includes(Number(el.dataset.dir))) return;
  const frames = whiteboardFrames(whiteboardOf(document)),
    index = frames.findIndex(frame => frame.id === state.presentationId),
    frame = index >= 0 && frames[index + Number(el.dataset.dir)];
  if (!frame) return;
  state.presentationId = frame.id;
  A.whiteboardLocate({ dataset: { id: frame.id } });
};
A.whiteboardPresentEnd = () => {
  const state = whiteboardState();
  if (!state.presentationId) return;
  Object.assign(state, state.presentationBefore || {});
  state.locateIntent = '';
  state.presentationId = '';
  state.presentationBefore = null;
  syncDiagramWindow();
  render();
  document.querySelector('[data-a=whiteboardToggleFocus]')?.focus({ preventScroll: true });
};
