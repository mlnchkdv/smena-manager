import { compareWhiteboards } from '../../src/shared/whiteboard-comparison.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWhiteboardHistory, whiteboardHash, whiteboardVersions, validateWhiteboardRestore } from '../../src/server/whiteboard-history.js';
const board = text => ({ version: 1, nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 160, color: 'neutral', title: 'A', text }], edges: [] });
test('whiteboard history is server derived bounded and checkpoints restoration', () => {
  const current = { projects: [{ id: 'p', whiteboard: board('original') }] },
    next = { projects: [{ id: 'p', whiteboard: board('edited') }] };
  captureWhiteboardHistory(current, next, 'editor');
  const versions = whiteboardVersions(next, 'p');
  assert.equal(versions.length, 1);
  assert.equal(versions[0].board.nodes[0].text, 'original');
  const restoring = structuredClone(next);
  restoring.projects[0].whiteboard = versions[0].board;
  restoring.projects[0].whiteboardRestoreFrom = { id: versions[0].id, baseHash: whiteboardHash(next.projects[0].whiteboard) };
  validateWhiteboardRestore(next, restoring.projects[0]);
  captureWhiteboardHistory(next, restoring, 'editor');
  assert.equal(whiteboardVersions(restoring, 'p')[0].board.nodes[0].text, 'edited');
  assert.equal(restoring.projects[0].whiteboardRestoreFrom, undefined);
  assert.equal(whiteboardVersions(restoring, 'other').length, 0);
});
test('stale forged and mutated whiteboard restoration is rejected', () => {
  const db = { projects: [{ id: 'p', whiteboard: board('old') }] },
    next = { projects: [{ id: 'p', whiteboard: board('new') }] };
  captureWhiteboardHistory(db, next, 'one');
  const v = whiteboardVersions(next, 'p')[0];
  assert.throws(
    () => validateWhiteboardRestore(next, { id: 'p', whiteboard: v.board, whiteboardRestoreFrom: { id: v.id, baseHash: whiteboardHash(board('stale')) } }),
    e => e.code === 'WHITEBOARD_RESTORE_STALE',
  );
  assert.throws(
    () =>
      validateWhiteboardRestore(next, {
        id: 'p',
        whiteboard: board('forged'),
        whiteboardRestoreFrom: { id: v.id, baseHash: whiteboardHash(next.projects[0].whiteboard) },
      }),
    /does not match/,
  );
});

test('a restore replay after a lost acknowledgement is harmless only while the exact target version is current', () => {
  const original = { whiteboards: [{ id: 'b', whiteboard: board('original') }] },
    edited = { whiteboards: [{ id: 'b', whiteboard: board('edited') }] };
  captureWhiteboardHistory(original, edited, 'one');
  const version = whiteboardVersions(edited, 'b')[0],
    command = { id: 'b', whiteboard: structuredClone(version.board), whiteboardRestoreFrom: { id: version.id, baseHash: whiteboardHash(board('edited')) } };
  const restored = { ...edited, whiteboards: [structuredClone(command)] };
  validateWhiteboardRestore(edited, command);
  captureWhiteboardHistory(edited, restored, 'one');
  const count = whiteboardVersions(restored, 'b').length;
  assert.doesNotThrow(() => validateWhiteboardRestore(restored, command));
  const replayed = { ...restored, whiteboards: [structuredClone(command)] };
  captureWhiteboardHistory(restored, replayed, 'one');
  assert.equal(whiteboardVersions(replayed, 'b').length, count);
  assert.deepEqual(replayed.whiteboards[0].whiteboard, version.board);
  assert.equal(replayed.whiteboards[0].whiteboardRestoreFrom, undefined);
  const stale = structuredClone(restored);
  stale.whiteboards[0].whiteboard.nodes[0].text = 'a later real edit';
  assert.throws(() => validateWhiteboardRestore(stale, command), { code: 'WHITEBOARD_RESTORE_STALE' });
  assert.throws(() => validateWhiteboardRestore(restored, { ...command, whiteboard: board('different payload') }), { code: 'WHITEBOARD_RESTORE_STALE' });
  assert.throws(() => validateWhiteboardRestore(restored, { ...command, id: 'another-board' }), { code: 'WHITEBOARD_RESTORE_STALE' });
  assert.throws(() => validateWhiteboardRestore({ ...restored, _whiteboardHistory: [] }, command), { code: 'WHITEBOARD_RESTORE_STALE' });
});

test('whiteboard comparison distinguishes additions removals and content or geometry changes', () => {
  const current = board('new'),
    previous = board('old');
  previous.nodes.push({ ...previous.nodes[0], id: 'restored' });
  current.edges.push({ id: 'removed', from: 'a', to: 'restored' });
  const before = JSON.stringify(current),
    result = compareWhiteboards(current, previous);
  assert.equal(result.changed, 1);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.equal(JSON.stringify(current), before);
});
