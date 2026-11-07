import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhiteboardTemplate, whiteboardTemplatePosition } from '../../src/shared/whiteboard-templates.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';
import { pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { whiteboardFrames } from '../../src/shared/whiteboard-presentation.js';
const factory = () => {
  let id = 0;
  return prefix => `${prefix}-${++id}`;
};
test('templates are bounded local diagrams with no hidden external material references', () => {
  for (const kind of ['brainstorm', 'decision', 'plan']) {
    const board = createWhiteboardTemplate(kind, { idFactory: factory(), labels: { brainstorm: 'Идеи', decision: 'Решение', now: 'Сейчас', next: 'Далее' } });
    assert.equal(validWhiteboard(board), true);
    assert.ok(board.nodes.length <= 5);
    assert.ok(board.nodes.every(n => n.type !== 'material' && !n.target));
    assert.ok(board.edges.every(edge => board.nodes.some(n => n.id === edge.from) && board.nodes.some(n => n.id === edge.to)));
  }
  assert.throws(() => createWhiteboardTemplate('unknown', { idFactory: factory() }), /INVALID/);
  assert.throws(() => createWhiteboardTemplate('plan', { idFactory: () => 'duplicate' }), /INVALID/);
});
test('template placement stays outside existing content even near the canvas coordinate limit', () => {
  const fragment = createWhiteboardTemplate('plan', { idFactory: factory() }),
    board = {
      version: 1,
      nodes: [{ id: 'edge', type: 'text', title: 'Keep', text: 'Keep', x: 49900, y: 49900, width: 160, height: 100, color: 'neutral' }],
      edges: [],
    };
  const point = whiteboardTemplatePosition(board, fragment);
  assert.ok(point);
  let unique = 500;
  const result = pasteWhiteboardSelection(board, fragment, p => p + '-' + ++unique, point.dx, point.dy);
  assert.equal(validWhiteboard(result.board), true);
  assert.ok(result.board.nodes.slice(1).every(n => n.x + n.width < board.nodes[0].x));
});
test('appending templates preserves existing cards, copies their ordered frames and fails atomically at capacity', () => {
  const fragment = createWhiteboardTemplate('plan', { idFactory: factory() }),
    destination = createWhiteboardTemplate('brainstorm', { idFactory: factory() }),
    before = structuredClone(destination);
  const appended = pasteWhiteboardSelection(destination, fragment, factory(), 1200, 0);
  // Factories must produce identities distinct from the destination as well.
  assert.equal(appended, null);
  let unique = 100;
  const result = pasteWhiteboardSelection(destination, fragment, p => `${p}-${++unique}`, 1200, 0);
  assert.equal(validWhiteboard(result.board), true);
  assert.deepEqual(destination, before);
  assert.deepEqual(
    whiteboardFrames(result.board).map(n => n.title),
    ['Brainstorm', 'Now', 'Next'],
  );
  const full = {
      version: 1,
      nodes: Array.from({ length: 200 }, (_, i) => ({
        id: 'full-' + i,
        type: 'text',
        title: 'Existing',
        text: 'Keep',
        x: i,
        y: 0,
        width: 160,
        height: 100,
        color: 'neutral',
      })),
      edges: [],
    },
    snapshot = structuredClone(full);
  assert.equal(
    pasteWhiteboardSelection(full, fragment, p => `${p}-${++unique}`, 0, 0),
    null,
  );
  assert.deepEqual(full, snapshot);
});
