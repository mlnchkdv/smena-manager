import { ic } from '../core/icons.js';
import { wbText as T } from '../core/whiteboard-state.js';
import { reorderWhiteboardLayers } from '../shared/whiteboard-selection.js';

const commands = [
  ['front', 'bring-to-front', 'Bring to front', 'На передний план'],
  ['forward', 'arrow-up', 'Bring forward', 'На слой вперёд'],
  ['backward', 'arrow-down', 'Send backward', 'На слой назад'],
  ['back', 'send-to-back', 'Send to back', 'На задний план'],
];

export function whiteboardLayerActions(board, ids) {
  return commands
    .map(
      ([direction, icon, en, ru]) =>
        `<button type="button" data-a="whiteboardReorderLayers" data-direction="${direction}" ${reorderWhiteboardLayers(board, ids, direction) === board.nodes ? 'disabled' : ''}>${ic(icon, 16)}<span>${T(en, ru)}</span></button>`,
    )
    .join('');
}
