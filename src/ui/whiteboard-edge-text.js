import { wbText as T } from '../core/whiteboard-state.js';
import { whiteboardEdgeText } from '../shared/whiteboard-edge.js';
export function whiteboardConnectionText(board, edge, nameOf) {
  return whiteboardEdgeText(board, edge, {
    nameOf,
    noLabel: T('No label', 'Без подписи'),
    directed: T('Directed', 'Со стрелкой'),
    undirected: T('No arrow', 'Без стрелки'),
    start: T('Start', 'Начало'),
    end: T('End', 'Конец'),
    style: T('Line', 'Линия'),
    endings: { none: T('None', 'Нет'), arrow: T('Arrow', 'Стрелка'), dot: T('Dot', 'Точка') },
    styles: { solid: T('Solid', 'Сплошная'), dashed: T('Dashed', 'Штриховая'), dotted: T('Dotted', 'Пунктирная') },
    colors: {
      neutral: T('Neutral', 'Нейтральный'),
      violet: T('Violet', 'Фиолетовый'),
      blue: T('Blue', 'Синий'),
      green: T('Green', 'Зелёный'),
      amber: T('Amber', 'Янтарный'),
      rose: T('Rose', 'Розовый'),
    },
  });
}
