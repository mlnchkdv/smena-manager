import { BOARD_SHAPES } from '../shared/project-whiteboard.js';
import { whiteboardShapeSvg } from '../shared/whiteboard-diagram.js';
import { wbText as T } from '../core/whiteboard-state.js';
const names = {
  rectangle: ['Rectangle', 'Прямоугольник'],
  ellipse: ['Ellipse', 'Эллипс'],
  diamond: ['Diamond', 'Ромб'],
  triangle: ['Triangle', 'Треугольник'],
  pentagon: ['Pentagon', 'Пятиугольник'],
  hexagon: ['Hexagon', 'Шестиугольник'],
  parallelogram: ['Parallelogram', 'Параллелограмм'],
  trapezoid: ['Trapezoid', 'Трапеция'],
  cylinder: ['Cylinder', 'Цилиндр'],
  document: ['Document', 'Документ'],
  'arrow-right': ['Arrow', 'Стрелка'],
  star: ['Star', 'Звезда'],
};
export function whiteboardShapePicker(shape, expanded) {
  return `<details class="whiteboard-shape-picker" ${expanded ? 'open' : ''}><summary>${T('Shape', 'Фигура')}: ${T(...names[shape])}</summary><div class="whiteboard-shape-grid" role="group" aria-label="${T('Choose a shape', 'Выберите фигуру')}">${BOARD_SHAPES.map(value => `<button type="button" data-a="whiteboardChooseShape" data-shape="${value}" aria-pressed="${shape === value}"><svg viewBox="0 0 90 60" aria-hidden="true">${whiteboardShapeSvg({ shape: value, width: 90, height: 60 })}</svg><span>${T(...names[value])}</span></button>`).join('')}</div></details>`;
}
