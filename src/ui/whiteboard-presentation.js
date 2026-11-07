import { whiteboardFrames } from '../shared/whiteboard-presentation.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
export function whiteboardPresentationNavigation(board, state) {
  if (!state.presentationId) return '';
  const frames = whiteboardFrames(board),
    index = frames.findIndex(frame => frame.id === state.presentationId);
  return `<nav class="whiteboard-presentation" aria-label="${T('Frame presentation', 'Разбор рамок')}" translate="no"><button class="ibtn" data-a="whiteboardPresentStep" data-dir="-1" aria-label="${T('Previous frame', 'Предыдущая рамка')}" ${index < 1 ? 'disabled' : ''}>${ic('chevron-left', 18)}</button><span class="whiteboard-presentation-title" translate="no">${index < 0 ? T('Frame removed', 'Рамка удалена') : `${index + 1} / ${frames.length} · ${esc(frames[index].title || T('Untitled frame', 'Рамка без названия'))}`}</span><button class="ibtn" data-a="whiteboardPresentStep" data-dir="1" aria-label="${T('Next frame', 'Следующая рамка')}" ${index < 0 || index >= frames.length - 1 ? 'disabled' : ''}>${ic('chevron-right', 18)}</button><button class="btn btn-secondary btn-sm" data-a="whiteboardPresentEnd">${T('Exit', 'Выйти')}</button></nav>`;
}
