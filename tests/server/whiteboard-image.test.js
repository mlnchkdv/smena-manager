import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWhiteboard, validWhiteboard, WHITEBOARD_IMAGE_VERSION } from '../../src/shared/project-whiteboard.js';
import { adjustWhiteboardImageCrop, ORIGINAL_WHITEBOARD_IMAGE, rotateWhiteboardImage } from '../../src/shared/whiteboard-image.js';
import { whiteboardMediaPosition } from '../../src/shared/whiteboard-media.js';
import { copyWhiteboardSelection, pasteWhiteboardSelection } from '../../src/shared/whiteboard-selection.js';
import { jsonCanvasExportLosses, parseWhiteboardImport } from '../../src/shared/whiteboard-portable.js';

const image = { turns: 0, crop: { x: 1000, y: 3000, width: 4000, height: 5000 } };
const file = { name: 'photo.png', mimeType: 'image/png', storageName: 'asset', bytes: 1200 };
const node = { id: 'img', type: 'material', target: 'file:asset', x: 50, y: 50, width: 240, height: 210, color: 'neutral', media: { image } };

test('only versioned file cards can persist bounded crop coordinates and quarter turns', () => {
  const board = { ...emptyWhiteboard(), version: WHITEBOARD_IMAGE_VERSION, nodes: [node] };
  assert.equal(validWhiteboard(board), true);
  assert.equal(validWhiteboard({ ...board, version: 6 }), false);
  assert.equal(validWhiteboard({ ...board, nodes: [{ ...node, target: 'note:other' }] }), false);
  for (const media of [
    { image, page: 2 },
    { image: { ...image, source: 'data:image/png;base64,A' } },
    { image: { ...image, turns: 4 } },
    { image: { ...image, crop: { ...image.crop, x: -1 } } },
    { image: { ...image, crop: { ...image.crop, y: 3000.1 } } },
    { image: { ...image, crop: { ...image.crop, width: 1 } } },
    { image: { ...image, crop: { ...image.crop, height: 7001 } } },
  ])
    assert.equal(validWhiteboard({ ...board, nodes: [{ ...node, media }] }), false);
  assert.deepEqual(whiteboardMediaPosition(file, node.media), { kind: 'image', image });
  assert.deepEqual(whiteboardMediaPosition({ ...file, mimeType: 'application/pdf' }, node.media), { kind: 'pdf' });
  const fragment = copyWhiteboardSelection(board, [node.id]);
  const pasted = pasteWhiteboardSelection(emptyWhiteboard(), fragment, () => 'image-copy');
  assert.equal(pasted.board.version, WHITEBOARD_IMAGE_VERSION);
  assert.deepEqual(pasted.board.nodes[0].media, node.media);
  assert.deepEqual(parseWhiteboardImport(JSON.stringify({ format: 'smena-project-whiteboard', version: 1, board })).board, board);
  assert.deepEqual(jsonCanvasExportLosses(board), ['imageEdits']);
});

test('rotation keeps the selected source area and moving or resizing stops at image boundaries', () => {
  const rotated = rotateWhiteboardImage(image, 1);
  assert.deepEqual(rotated, { turns: 1, crop: { x: 2000, y: 1000, width: 5000, height: 4000 } });
  assert.deepEqual(rotateWhiteboardImage(rotated, -1), image);
  assert.deepEqual(rotateWhiteboardImage(ORIGINAL_WHITEBOARD_IMAGE, -1).crop, ORIGINAL_WHITEBOARD_IMAGE.crop);
  assert.deepEqual(adjustWhiteboardImageCrop(image.crop, 'move', 20000, -25000), { x: 6000, y: 0, width: 4000, height: 5000 });
  assert.deepEqual(adjustWhiteboardImageCrop(image.crop, 'nw', 9999, -9999), { x: 4900, y: 0, width: 100, height: 8000 });
  assert.deepEqual(adjustWhiteboardImageCrop(image.crop, 'se', -9999, 20000), { x: 1000, y: 3000, width: 100, height: 7000 });
});
