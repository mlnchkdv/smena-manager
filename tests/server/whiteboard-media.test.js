import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validWhiteboardMedia,
  parseWhiteboardTime,
  formatWhiteboardTime,
  whiteboardMediaPosition,
  clampedMediaStart,
} from '../../src/shared/whiteboard-media.js';
import { validWhiteboard } from '../../src/shared/project-whiteboard.js';
import { copyWhiteboardSelection, pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { parseWhiteboardImport, exportJsonCanvas, jsonCanvasExportLosses } from '../../src/shared/whiteboard-portable.js';
import { captureWhiteboardHistory, whiteboardHash } from '../../src/server/whiteboard-history.js';
const board = () => ({
  version: 2,
  nodes: [{ id: 'media', type: 'material', target: 'file:f', media: { page: 8 }, x: 0, y: 0, width: 260, height: 180, color: 'neutral' }],
  edges: [],
});
test('media positions are explicit bounded references in version 2, not unversioned file payloads', () => {
  const value = board();
  assert.equal(validWhiteboard(value), true);
  assert.equal(validWhiteboard({ ...value, version: 1 }), false);
  for (const media of [
    { page: 0 },
    { page: 100001 },
    { seconds: -1 },
    { seconds: 1.1 },
    { seconds: Infinity },
    { seconds: 604801 },
    { page: 2, seconds: 1 },
    { url: 'https://example.test/private' },
    { token: 'secret' },
    null,
    [],
  ]) {
    assert.equal(validWhiteboardMedia(media), false);
    assert.equal(validWhiteboard({ ...value, nodes: [{ ...value.nodes[0], media }] }), false);
  }
  for (const target of ['note:n', 1, {}, null]) assert.equal(validWhiteboard({ ...value, nodes: [{ ...value.nodes[0], target }] }), false);
  assert.equal(validWhiteboard({ ...value, nodes: [{ ...value.nodes[0], media: { seconds: 604800 } }] }), true);
});
test('timecode parsing handles hours, long minutes and invalid or out-of-range source without coercing blanks to zero', () => {
  for (const [source, seconds] of [
    ['01:02:03', 3723],
    ['90:00', 5400],
    ['7', 7],
    ['0', 0],
    ['168:00:00', 604800],
    ['', null],
    ['  ', null],
  ])
    assert.equal(parseWhiteboardTime(source), seconds);
  for (const source of ['1:60', '1:2:60', '-1', '1.5', '1e3', 'javascript:1', '1:2:3:4', '168:00:01']) assert.ok(Number.isNaN(parseWhiteboardTime(source)));
  assert.equal(formatWhiteboardTime(3723), '01:02:03');
  assert.equal(formatWhiteboardTime(604800), '168:00:00');
  assert.equal(clampedMediaStart(8, 12), 8);
  assert.equal(clampedMediaStart(60, 12), 11.95);
  assert.equal(clampedMediaStart(0, 0), 0);
  assert.equal(clampedMediaStart(8, Infinity), null);
  assert.equal(clampedMediaStart(8, NaN), null);
  assert.equal(clampedMediaStart(-1, 12), null);
});
test('preview positions follow the authorized file format and existing byte limit', () => {
  const pdf = { name: 'guide.pdf', mimeType: 'application/pdf', storageName: 'safe', bytes: 100 };
  assert.deepEqual(whiteboardMediaPosition(pdf, { page: 8 }), { kind: 'pdf', page: 8 });
  assert.deepEqual(whiteboardMediaPosition(pdf, { seconds: 4 }), { kind: 'pdf' });
  const video = { name: 'movie.mp4', mimeType: 'video/mp4', storageName: 'safe', bytes: 10 * 1024 ** 3 };
  assert.deepEqual(whiteboardMediaPosition(video, { seconds: 3723 }), { kind: 'video', seconds: 3723 });
  assert.deepEqual(whiteboardMediaPosition({ ...pdf, bytes: 21 * 1024 ** 2 }, { page: 8 }), { kind: null });
  assert.deepEqual(whiteboardMediaPosition({ ...video, mimeType: 'text/html' }, { seconds: 3723 }), { kind: null });
});
test('native copy, paste, history and export preserve positions while JSON Canvas requires an explicit loss review', () => {
  const value = board(),
    fragment = copyWhiteboardSelection(value, ['media']);
  assert.deepEqual(fragment, value);
  assert.deepEqual(value, parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, board: value })).board);
  const pasted = pasteWhiteboardSelection({ version: 1, nodes: [], edges: [] }, fragment, () => 'copy');
  assert.equal(pasted.board.version, 2);
  assert.deepEqual(pasted.board.nodes[0].media, { page: 8 });
  assert.deepEqual(jsonCanvasExportLosses(value), ['mediaOffsets']);
  assert.throws(() => exportJsonCanvas(value), /LOSS_REVIEW_REQUIRED/);
  assert.equal(exportJsonCanvas(value, { allowLossy: true }).nodes[0].url, 'smena://material/file/f');
  const changed = structuredClone(value);
  changed.nodes[0].media.page = 9;
  assert.notEqual(whiteboardHash(value), whiteboardHash(changed));
  const current = { whiteboards: [{ id: 'b', whiteboard: value }], _whiteboardHistory: [] },
    next = { whiteboards: [{ id: 'b', whiteboard: changed }] };
  captureWhiteboardHistory(current, next, 'actor');
  assert.deepEqual(next._whiteboardHistory[0].board.nodes[0].media, { page: 8 });
});
