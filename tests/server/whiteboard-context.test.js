import test from 'node:test';
import assert from 'node:assert/strict';
import { patchWhiteboardContext } from '../../src/shared/whiteboard-context.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';
const fixture = () => ({
  version: 1,
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 120, color: 'neutral', title: 'A', text: 'Original' },
    { id: 'b', type: 'material', target: 'note:b', x: 300, y: 0, width: 200, height: 120, color: 'blue' },
  ],
  edges: [{ id: 'e', from: 'a', to: 'b', label: 'Reference', arrow: true, color: 'neutral' }],
});
test('context edits preserve concurrent movement and unrelated content, and reject an overwritten title', () => {
  const board = fixture();
  board.nodes[0].x = 500;
  board.nodes[0].text = 'Another writer';
  assert.deepEqual(patchWhiteboardContext(board, { kind: 'node', id: 'a', field: 'title', base: 'A', value: 'Renamed' }), { changed: true });
  assert.equal(board.nodes[0].x, 500);
  assert.equal(board.nodes[0].text, 'Another writer');
  const before = structuredClone(board);
  assert.equal(patchWhiteboardContext(board, { kind: 'node', id: 'a', field: 'title', base: 'A', value: 'Stale' }).error, 'changed');
  assert.deepEqual(board, before);
  assert.deepEqual(patchWhiteboardContext(board, { kind: 'node', id: 'a', field: 'title', base: 'A', value: 'Renamed' }), { changed: false });
  assert.equal(validWhiteboard(board), true);
});
test('context controls cannot change identity, endpoints or original material content', () => {
  const board = fixture(),
    before = structuredClone(board);
  for (const change of [
    { kind: 'node', id: 'b', field: 'title', value: 'Copied title' },
    { kind: 'node', id: 'b', field: null, value: 'Invalid field' },
    { kind: 'node', id: 'a', field: 'target', value: 'note:other' },
    { kind: 'edge', id: 'e', field: 'from', value: 'b' },
    { kind: 'edge', id: 'e', field: 'arrow', value: 'false' },
    { kind: 'node', id: 'a', field: 'color', value: 'arbitrary' },
    { kind: 'node', id: 'a', field: 'title', value: 'X'.repeat(121) },
  ])
    assert.equal(patchWhiteboardContext(board, { base: undefined, ...change }).error, 'invalid');
  assert.deepEqual(board, before);
  assert.equal(patchWhiteboardContext(board, { kind: 'edge', id: 'deleted', field: 'arrow', base: true, value: false }).error, 'missing');
  assert.deepEqual(patchWhiteboardContext(board, { kind: 'edge', id: 'e', field: 'arrow', base: true, value: false }), { changed: true });
  assert.equal(validWhiteboard(board), true);
});
