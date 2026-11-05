import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeWhiteboardGroup } from '../../src/shared/whiteboard-group-resize.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';
test('group scaling preserves edges, respects explicit frame contents and size limits', () => {
  const node = (id, type, x, y, width, height) => ({ id, type, x, y, width, height, title: id, text: '', color: 'neutral' });
  const board = {
    version: 1,
    nodes: [node('frame', 'group', 0, 0, 600, 400), node('a', 'text', 20, 20, 200, 120), node('b', 'text', 800, 0, 200, 120)],
    edges: [{ id: 'e', from: 'a', to: 'b', label: '', arrow: true, color: 'neutral' }],
  };
  const frames = resizeWhiteboardGroup(board, ['frame'], 'se', 300, 200);
  assert.deepEqual(frames.nodes[1], board.nodes[1]);
  const all = resizeWhiteboardGroup(board, ['frame'], 'se', 300, 200, { contents: true });
  assert.equal(all.nodes[1].width, 300);
  assert.deepEqual(all.edges, board.edges);
  assert.deepEqual(all.nodes[2], board.nodes[2]);
  assert.ok(validWhiteboard(resizeWhiteboardGroup(board, ['a', 'b'], 'nw', -100000, -100000)));
  assert.ok(validWhiteboard(resizeWhiteboardGroup(board, ['a', 'b'], 'se', -100000, -100000)));
  assert.equal(board.nodes[0].width, 600);
});
