import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardConnection } from '../../src/shared/whiteboard-connect.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';

const node = id => ({ id, type: 'text', title: id, text: '', x: 0, y: 0, width: 240, height: 160, color: 'neutral' });
test('direct connections preserve current edits, reject missing endpoints and reuse repeated gestures', () => {
  const board = { version: 1, nodes: [node('a'), node('b')], edges: [] };
  const result = whiteboardConnection(board, 'a', 'b', 'edge');
  assert.equal(result.created, true);
  assert.equal(board.edges.length, 0);
  board.edges.push(result.edge);
  assert.equal(validWhiteboard(board), true);
  board.edges[0].label = 'An independent edit';
  const repeated = whiteboardConnection(board, 'a', 'b', 'other-id');
  assert.equal(repeated.created, false);
  assert.equal(repeated.edge.label, 'An independent edit');
  assert.equal(whiteboardConnection(board, 'a', 'a', 'self'), null);
  board.nodes.pop();
  assert.equal(whiteboardConnection(board, 'a', 'b', 'deleted'), null);
});
test('direct connection capacity never bypasses the board limit', () => {
  const board = { nodes: [node('a'), node('b')], edges: Array.from({ length: 400 }, (_, i) => ({ id: 'e' + i, from: 'b', to: 'a' })) };
  assert.equal(whiteboardConnection(board, 'a', 'b', 'full'), null);
});
