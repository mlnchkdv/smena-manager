import test from 'node:test';
import assert from 'node:assert/strict';
import { validWhiteboard, removeWhiteboardNode } from '../../src/shared/project-whiteboard.js';
import { whiteboardFrames, reorderWhiteboardFrame } from '../../src/shared/whiteboard-presentation.js';
import { copyWhiteboardSelection, pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { jsonCanvasExportLosses, exportJsonCanvas, parseWhiteboardImport } from '../../src/shared/whiteboard-portable.js';
import { mergeWorkspaceData } from '../../src/shared/workspace-merge.js';
import { captureWhiteboardHistory, validateWhiteboardRestore, whiteboardHash } from '../../src/server/whiteboard-history.js';
const frame = (id, x) => ({ id, x, y: 0, width: 300, height: 200, type: 'group', title: id, text: '', color: 'blue' });
const source = () => ({ version: 1, nodes: [frame('a', 0), frame('b', 400), frame('c', 800)], edges: [] });

test('presentation order is independent of frame geometry and is a strictly bounded v4 property', () => {
  const board = source();
  assert.deepEqual(
    whiteboardFrames(board).map(n => n.id),
    ['a', 'b', 'c'],
  );
  assert.equal(reorderWhiteboardFrame(board, 'b', -1), true);
  assert.equal(board.version, 4);
  assert.equal(validWhiteboard(board), true);
  assert.deepEqual(
    whiteboardFrames(board).map(n => n.id),
    ['b', 'a', 'c'],
  );
  assert.deepEqual(
    board.nodes.map(n => n.x),
    [0, 400, 800],
  );
  assert.equal(reorderWhiteboardFrame(board, 'b', -1), false);
  for (const change of [
    b => (b.version = 3),
    b => (b.nodes[0].sequence = -1),
    b => (b.nodes[0].sequence = 1.2),
    b => (b.nodes[0].sequence = 1000001),
    b => (b.nodes[0].type = 'text'),
  ]) {
    const bad = structuredClone(board);
    change(bad);
    assert.equal(validWhiteboard(bad), false);
  }
  removeWhiteboardNode(board, 'a');
  assert.equal(validWhiteboard(board), true);
  assert.deepEqual(
    whiteboardFrames(board).map(n => n.id),
    ['b', 'c'],
  );
});
test('copy and native export retain ordering; pasted frames append without changing the input document', () => {
  const board = source();
  reorderWhiteboardFrame(board, 'b', -1);
  const before = structuredClone(board),
    fragment = copyWhiteboardSelection(board, ['a', 'b']),
    destination = { version: 1, nodes: [frame('existing', -500)], edges: [] };
  let counter = 0;
  const pasted = pasteWhiteboardSelection(destination, fragment, () => `copy-${++counter}`, 2000, 0);
  assert.deepEqual(board, before);
  assert.equal(destination.version, 1);
  assert.equal(destination.nodes[0].sequence, undefined);
  assert.equal(validWhiteboard(pasted.board), true);
  assert.deepEqual(
    whiteboardFrames(pasted.board).map(n => n.title),
    ['existing', 'b', 'a'],
  );
  assert.deepEqual(parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, board })).board, board);
  assert.deepEqual(jsonCanvasExportLosses(board), ['frameOrder']);
  assert.throws(() => exportJsonCanvas(board), /LOSS_REVIEW_REQUIRED/);
  assert.equal(exportJsonCanvas(board, { allowLossy: true }).nodes[0].sequence, undefined);
});
test('frame reordering merges with independent movement, conflicts on competing ranks and restores exactly', () => {
  const initial = source();
  reorderWhiteboardFrame(initial, 'b', -1);
  const base = { whiteboards: [{ id: 'board', whiteboard: initial }] },
    local = structuredClone(base),
    remote = structuredClone(base);
  reorderWhiteboardFrame(local.whiteboards[0].whiteboard, 'a', 1);
  remote.whiteboards[0].whiteboard.nodes[0].x = 50;
  const merged = mergeWorkspaceData(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.whiteboards[0].whiteboard.nodes[0].x, 50);
  assert.equal(validWhiteboard(merged.data.whiteboards[0].whiteboard), true);
  reorderWhiteboardFrame(remote.whiteboards[0].whiteboard, 'a', -1);
  assert.ok(mergeWorkspaceData(base, local, remote).conflicts.length);
  const current = structuredClone(base),
    next = structuredClone(local);
  captureWhiteboardHistory(current, next, 'owner');
  const version = next._whiteboardHistory.find(v => v.project === 'board'),
    restore = { id: 'board', whiteboard: version.board, whiteboardRestoreFrom: { id: version.id, baseHash: whiteboardHash(next.whiteboards[0].whiteboard) } };
  assert.doesNotThrow(() => validateWhiteboardRestore(next, restore));
  assert.deepEqual(
    whiteboardFrames(restore.whiteboard).map(n => n.id),
    ['b', 'a', 'c'],
  );
});
