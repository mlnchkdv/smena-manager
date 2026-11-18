import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWhiteboard, validWhiteboard, WHITEBOARD_PDF_PAGE_VERSION } from '../../src/shared/project-whiteboard.js';
import { whiteboardPdfPagePositions } from '../../src/shared/whiteboard-pdf-pages.js';
import { whiteboardMediaPosition } from '../../src/shared/whiteboard-media.js';
import { copyWhiteboardSelection, pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { parseWhiteboardImport } from '../../src/shared/whiteboard-portable.js';

const source = { id: 'pdf', type: 'material', target: 'file:source', x: 100, y: 200, width: 360, height: 460, color: 'blue' };
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('extracted pages start near the PDF in reading order and leave space around cards', () => {
  const grid = whiteboardPdfPagePositions([source], source, 5);
  assert.equal(grid[0].x, source.x);
  assert.ok(grid[0].y > source.y + source.height);
  assert.ok(grid[2].x > grid[1].x && grid[1].x > grid[0].x);
  assert.equal(grid[2].y, grid[0].y);
  assert.ok(grid[3].y > grid[0].y + grid[0].height);
  assert.equal(grid[3].x, grid[0].x);

  const frame = { id: 'frame', type: 'group', x: 0, y: 0, width: 1800, height: 1600 };
  const next = whiteboardPdfPagePositions([source, frame], source, 12);
  assert.equal(next.length, 12);
  assert.ok(next.every(card => !overlaps(card, source) && !overlaps(card, frame)));
});

test('page grids stay inside the coordinate boundary and reject invalid batch sizes', () => {
  const nearEdge = { ...source, x: 49900, y: 49900 };
  const grid = whiteboardPdfPagePositions([nearEdge], nearEdge, 12);
  assert.equal(grid.length, 12);
  for (const card of grid) {
    assert.ok(!overlaps(card, nearEdge));
    assert.ok(card.x >= -50000 && card.x + card.width <= 50000);
    assert.ok(card.y >= -50000 && card.y + card.height <= 50000);
  }
  for (const count of [0, -1, 1.5, 13]) assert.equal(whiteboardPdfPagePositions([source], source, count), null);
});

test('only the new board version accepts fixed PDF pages, which survive copy and native import', () => {
  const page = { ...source, id: 'extracted', media: { page: 3, fixed: true } };
  const board = { version: WHITEBOARD_PDF_PAGE_VERSION, nodes: [source, page], edges: [] };
  assert.equal(validWhiteboard(board), true);
  assert.equal(validWhiteboard({ ...board, version: 5 }), false);
  for (const media of [
    { seconds: 10, fixed: true },
    { page: 3, fixed: false },
    { page: 0, fixed: true },
    { page: 3, fixed: true, data: '' },
  ])
    assert.equal(validWhiteboard({ ...board, nodes: [{ ...page, media }] }), false);
  const file = { name: 'source.pdf', mimeType: 'application/pdf', storageName: 'source', bytes: 10 };
  assert.deepEqual(whiteboardMediaPosition(file, page.media), { kind: 'pdf', page: 3, fixed: true });
  assert.deepEqual(whiteboardMediaPosition(file, { page: 3 }), { kind: 'pdf', page: 3 });
  const copied = pasteWhiteboardSelection(emptyWhiteboard(), copyWhiteboardSelection(board, [page.id]), () => 'copy');
  assert.equal(copied.board.version, WHITEBOARD_PDF_PAGE_VERSION);
  assert.deepEqual(copied.board.nodes[0].media, page.media);
  assert.deepEqual(parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, board })).board, board);
});
