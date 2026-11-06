import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardNodeCamera } from '../../src/shared/whiteboard-camera.js';
import { defaultDiagramViews, validDiagramViews } from '../../src/shared/diagram-views.js';

test('large frame navigation stays centered and can be saved in a short mobile viewport', () => {
  const node = { x: -30, y: -50, width: 2000, height: 2000 };
  for (const viewport of [{ width: 802, height: 220 }, { width: 288, height: 320 }, { width: 1200, height: 700 }]) {
    const camera = whiteboardNodeCamera(node, viewport);
    assert.ok(camera.zoom >= 0.2 && camera.zoom <= 1);
    assert.equal(camera.x + (node.x + node.width / 2) * camera.zoom, viewport.width / 2);
    assert.equal(camera.y + (node.y + node.height / 2) * camera.zoom, viewport.height / 2);
    assert.equal(
      validDiagramViews({ ...defaultDiagramViews(), items: [{ id: 'large', name: 'Frame', kind: 'board', project: 'board', layout: { ...camera, outline: false } }] }),
      true,
    );
  }
});

test('card navigation avoids unnecessary enlargement and rejects missing viewport geometry', () => {
  const node = { x: 100, y: 200, width: 240, height: 160 };
  assert.deepEqual(whiteboardNodeCamera(node, { width: 800, height: 500 }), { zoom: 1, x: 180, y: -30 });
  assert.equal(whiteboardNodeCamera(node, { width: 0, height: 500 }), null);
  assert.equal(whiteboardNodeCamera({ ...node, width: NaN }, { width: 800, height: 500 }), null);
});
