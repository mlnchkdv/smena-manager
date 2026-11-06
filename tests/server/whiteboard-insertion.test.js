import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardInsertionPoint } from '../../src/shared/whiteboard-insertion.js';
test('pointer insertion reverses the current pan and zoom and stays inside geometry limits', () => {
  assert.deepEqual(whiteboardInsertionPoint({ x: 350, y: 250 }, { left: 100, top: 50 }, { x: 50, y: 100, zoom: 0.5 }), { x: 400, y: 200 });
  assert.deepEqual(whiteboardInsertionPoint({ x: 1e8, y: -1e8 }, { left: 0, top: 0 }, { x: 0, y: 0, zoom: 1 }), { x: 49000, y: -49000 });
  assert.equal(whiteboardInsertionPoint({ x: 1, y: 1 }, { left: 0, top: 0 }, { x: 0, y: 0, zoom: 0 }), null);
  assert.equal(whiteboardInsertionPoint({ x: NaN, y: 1 }, { left: 0, top: 0 }, { x: 0, y: 0, zoom: 1 }), null);
});
