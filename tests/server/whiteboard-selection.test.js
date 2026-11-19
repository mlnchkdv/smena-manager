import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyWhiteboardSelection,
  pasteWhiteboardSelection,
  arrangeWhiteboardSelection,
  whiteboardSelectionInRect,
  whiteboardSelectionOffset,
  whiteboardSelectionNodes,
  expandWhiteboardSelection,
  groupWhiteboardSelection,
  ungroupWhiteboardSelection,
} from '../../src/shared/whiteboard-selection.js';
import { removeWhiteboardNode, validWhiteboard } from '../../src/shared/project-whiteboard.js';
import { jsonCanvasExportLosses } from '../../src/shared/whiteboard-portable.js';
import { compareWhiteboards } from '../../src/shared/whiteboard-comparison.js';
import { whiteboardDiffVisibleIds } from '../../src/shared/whiteboard-edge.js';
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

test('selection rectangle picks intersecting cards and only fully contained frames', () => {
  const nodes = [card('frame', 0, 0, 'group'), card('inside', 30, 30), card('near', 240, 80), card('outside', 720, 40)];
  assert.deepEqual(whiteboardSelectionInRect(nodes, { left: 90, top: 20, right: 280, bottom: 130 }), ['inside', 'near']);
  assert.deepEqual(whiteboardSelectionInRect(nodes, { left: 0, top: 0, right: 600, bottom: 500 }), ['frame', 'inside', 'near']);
  assert.deepEqual(whiteboardSelectionInRect(nodes, { left: 600, top: 0, right: 720, bottom: 500 }), []);
  assert.deepEqual(whiteboardSelectionInRect(nodes, { left: 15, top: 50, right: 15, bottom: 100 }), []);
});

test('drag and keyboard offsets clamp a selection together at board boundaries', () => {
  const nodes = [card('a', 49980, -49985), card('b', 48000, -49600)];
  assert.deepEqual(whiteboardSelectionOffset(nodes, 90, -50), { dx: 20, dy: -15 });
  assert.deepEqual(whiteboardSelectionOffset(nodes, -30, 40), { dx: -30, dy: 40 });
  assert.deepEqual(whiteboardSelectionOffset([], 10, 10), { dx: 0, dy: 0 });
});

test('explicit membership persists independently of the cards inside a frame or group bounds', () => {
  const board = { version: 1, nodes: [card('frame', 0, 0, 'group'), card('a', 30, 40), card('b', 700, 200), card('other', 300, 10)], edges: [] };
  const nodes = structuredClone(board.nodes);
  groupWhiteboardSelection(board, ['a', 'frame'], 'ignored');
  assert.equal(board.groups, undefined);
  groupWhiteboardSelection(board, ['a', 'b'], 'pair');
  assert.equal(validWhiteboard(JSON.parse(JSON.stringify(board))), true);
  assert.deepEqual(board.nodes, nodes);
  const ungrouped = { ...board, nodes, groups: [] };
  const diff = compareWhiteboards(ungrouped, board);
  assert.deepEqual(
    diff.rows.map(({ id, kind, change }) => ({ id, kind, change })),
    [{ id: 'pair', kind: 'group', change: 'added' }],
  );
  assert.deepEqual([...whiteboardDiffVisibleIds(ungrouped, board, diff.rows)], ['a', 'b']);
  assert.deepEqual(expandWhiteboardSelection(board, ['b']), ['b', 'a']);
  assert.deepEqual(
    whiteboardSelectionNodes(board, ['a']).map(n => n.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    whiteboardSelectionNodes(board, ['frame']).map(n => n.id),
    ['frame', 'a', 'b', 'other'],
  );

  const aligned = arrangeWhiteboardSelection(board, ['b', 'other'], 'top');
  assert.deepEqual(
    aligned.nodes.map(n => n.y),
    [0, 10, 170, 10],
  );
  assert.equal(arrangeWhiteboardSelection(board, ['a', 'b'], 'left'), board);
  const fragment = copyWhiteboardSelection(board, ['b']);
  assert.deepEqual(fragment.groups, [{ id: 'pair', members: ['a', 'b'] }]);
  assert.deepEqual(jsonCanvasExportLosses(fragment), ['cardGroups']);
  let seq = 0;
  const pasted = pasteWhiteboardSelection(board, fragment, prefix => prefix + seq++);
  assert.deepEqual(pasted.board.groups, [board.groups[0], { id: 'wg2', members: pasted.ids }]);

  groupWhiteboardSelection(board, ['a', 'other'], 'merged');
  assert.deepEqual(board.groups, [{ id: 'merged', members: ['a', 'other', 'b'] }]);
  removeWhiteboardNode(board, 'b');
  assert.deepEqual(board.groups[0].members, ['a', 'other']);
  const remaining = structuredClone(board.nodes);
  ungroupWhiteboardSelection(board, ['other']);
  assert.deepEqual(board.nodes, remaining);
  assert.equal(board.groups, undefined);
  assert.equal(validWhiteboard(board), true);
});

test('board validation rejects ambiguous and missing group members and deleting a member dissolves a pair', () => {
  const board = { version: 8, nodes: [card('frame', 0, 0, 'group'), ...['a', 'b', 'c', 'd'].map(id => card(id, 0, 0))], edges: [] };
  const group = { id: 'pair', members: ['a', 'b'] };
  for (const groups of [
    [{ ...group, members: ['a'] }],
    [{ ...group, members: ['a', 'a'] }],
    [{ ...group, members: ['a', 'unknown'] }],
    [{ ...group, members: ['a', 'frame'] }],
    [{ ...group, id: 'a' }],
    [group, { id: 'pair', members: ['c', 'd'] }],
    [group, { id: 'another', members: ['a', 'c'] }],
  ]) {
    assert.equal(validWhiteboard({ ...board, groups }), false);
  }
  board.groups = [group];
  assert.equal(validWhiteboard({ ...board, version: 7 }), false);
  removeWhiteboardNode(board, 'b');
  assert.equal(board.groups, undefined);
  assert.equal(validWhiteboard(board), true);
});
