import { validWhiteboard, whiteboardBounds } from './project-whiteboard.js';
const defaults = {
  brainstorm: 'Brainstorm',
  decision: 'Decision map',
  plan: 'Now and next',
  question: 'Question',
  questionBody: 'Define a focused question.',
  idea: 'Idea',
  ideaBody: 'Add one idea per card.',
  decisionNode: 'Decision',
  decisionBody: 'What needs to be decided?',
  optionA: 'Option A',
  optionB: 'Option B',
  optionBody: 'Benefits, risks and evidence.',
  now: 'Now',
  next: 'Next',
  action: 'Next action',
  actionBody: 'Describe an outcome and a clear next step.',
};
export function createWhiteboardTemplate(kind, { idFactory, labels = {} } = {}) {
  if (!['brainstorm', 'decision', 'plan'].includes(kind) || typeof idFactory !== 'function') throw new TypeError('WHITEBOARD_TEMPLATE_INVALID');
  const title = key => labels[key] ?? defaults[key],
    nodes = [],
    edges = [];
  const node = (type, name, text, x, y, width, height, color = 'neutral', extra = {}) => {
    const value = { id: idFactory('wc'), type, title: name, text, x, y, width, height, color, ...extra };
    nodes.push(value);
    return value.id;
  };
  const frame = (name, x, width, height, sequence = 0) => node('group', name, '', x, 0, width, height, 'blue', { sequence });
  const text = (name, body, x, y, width = 240, height = 160, color = 'neutral') => node('text', name, body, x, y, width, height, color);
  if (kind === 'brainstorm') {
    frame(title(kind), 0, 900, 480);
    text(title('question'), title('questionBody'), 40, 60, 820, 120);
    for (let i = 0; i < 3; i++) text(title('idea') + ' ' + (i + 1), title('ideaBody'), 40 + i * 290, 240, 240, 160, 'amber');
  } else if (kind === 'decision') {
    frame(title(kind), 0, 900, 560);
    const decision = node('shape', title('decisionNode'), title('decisionBody'), 330, 65, 240, 180, 'amber', { shape: 'diamond' });
    for (const [key, x, color] of [
      ['optionA', 60, 'green'],
      ['optionB', 600, 'rose'],
    ]) {
      const option = text(title(key), title('optionBody'), x, 340, 240, 160, color);
      edges.push({ id: idFactory('we'), from: decision, to: option, label: '', arrow: true, color: 'neutral' });
    }
  } else {
    frame(title('now'), 0, 600, 420, 0);
    frame(title('next'), 680, 600, 420, 1);
    text(title('action'), title('actionBody'), 60, 100, 480, 220);
    text(title('action'), title('actionBody'), 740, 100, 480, 220);
  }
  const board = { version: 4, nodes, edges };
  if (!validWhiteboard(board)) throw new TypeError('WHITEBOARD_TEMPLATE_INVALID');
  return board;
}
export function whiteboardTemplatePosition(board, fragment) {
  if (!validWhiteboard(board) || !validWhiteboard(fragment)) return null;
  if (!board.nodes.length) return { dx: 0, dy: 0 };
  const b = whiteboardBounds(board),
    f = whiteboardBounds(fragment),
    x = Math.max(-50000, Math.min(b.x, 50000 - f.width)),
    y = Math.max(-50000, Math.min(b.y, 50000 - f.height));
  const positions = [
    { x: b.x + b.width + 80, y },
    { x, y: b.y + b.height + 80 },
    { x: b.x - f.width - 80, y },
    { x, y: b.y - f.height - 80 },
  ];
  const point = positions.find(p => p.x >= -50000 && p.y >= -50000 && p.x + f.width <= 50000 && p.y + f.height <= 50000);
  return point ? { dx: point.x - f.x, dy: point.y - f.y } : null;
}
