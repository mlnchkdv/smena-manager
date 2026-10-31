import test from 'node:test';
import assert from 'node:assert/strict';
import { copyWhiteboardSelection, pasteWhiteboardSelection, arrangeWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
const card = (id, x, y, type = 'text') => ({
  id,
  type,
  x,
  y,
  width: type === 'group' ? 600 : 200,
  height: type === 'group' ? 500 : 120,
  color: 'neutral',
  title: id,
  text: '',
});
test('copy and paste regenerate connector identities and retain only internal edges', () => {
  let seq = 0;
  const board = {
    version: 1,
    nodes: [card('a', 0, 0), card('b', 350, 100), card('c', 900, 0)],
    edges: [
      { id: 'e', from: 'a', to: 'b', label: 'Plan', arrow: true, color: 'blue' },
      { id: 'f', from: 'a', to: 'c', label: 'Outside', arrow: false, color: 'neutral' },
    ],
  };
  const part = copyWhiteboardSelection(board, ['a', 'b']);
  assert.equal(part.edges.length, 1);
  const pasted = pasteWhiteboardSelection(board, part, prefix => prefix + seq++);
  assert.equal(pasted.board.nodes.length, 5);
  assert.equal(pasted.board.edges.length, 3);
  assert.equal(pasted.board.edges[2].from, pasted.ids[0]);
  assert.equal(pasted.board.edges[2].to, pasted.ids[1]);
  assert.equal(
    pasteWhiteboardSelection(board, { ...part, nodes: [{ ...part.nodes[0], x: 50000 }] }, prefix => prefix + seq++),
    null,
  );
});
test('alignment and distribution preserve edges and move contents with selected frames', () => {
  const board = { version: 1, nodes: [card('frame', 0, 0, 'group'), card('inside', 30, 30), card('other', 800, 200, 'group')], edges: [] };
  const next = arrangeWhiteboardSelection(board, ['frame', 'other'], 'top');
  assert.equal(next.nodes[2].y, 0);
  assert.equal(next.nodes[1].y, 30);
  const nodes = [card('a', 0, 30), card('b', 500, 80), card('c', 1000, 150)];
  assert.deepEqual(
    arrangeWhiteboardSelection({ version: 1, nodes, edges: [] }, ['a', 'b', 'c'], 'top').nodes.map(n => n.y),
    [30, 30, 30],
  );
  assert.equal(copyWhiteboardSelection(board, ['frame']).nodes.length, 2);
});
