import assert from 'node:assert/strict';
import test from 'node:test';
import { spatialNeighbor } from '../../src/shared/spatial-navigation.js';
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
test('different card heights preserve grid rows and aligned vertical navigation', () => {
  const grid = [rect(0, 0, 180, 80), rect(200, 0, 180, 160), rect(0, 180, 180, 100), rect(200, 180, 180, 120)];
  assert.equal(spatialNeighbor(grid, 0, 'ArrowRight'), 1);
  assert.equal(spatialNeighbor(grid, 0, 'ArrowDown'), 2);
  assert.equal(spatialNeighbor(grid, 1, 'ArrowDown'), 3);
  assert.equal(spatialNeighbor(grid, 3, 'ArrowUp'), 1);
  assert.equal(spatialNeighbor(grid, 1, 'ArrowRight'), -1);
});
test('a single-column mixed list does not jump vertically on horizontal arrows', () => {
  const list = [rect(0, 0, 300, 70), rect(12, 90, 270, 120), rect(0, 230, 300, 90)];
  assert.equal(spatialNeighbor(list, 0, 'ArrowRight'), -1);
  assert.equal(spatialNeighbor(list, 1, 'ArrowLeft'), -1);
  assert.equal(spatialNeighbor(list, 0, 'ArrowDown'), 1);
  assert.equal(spatialNeighbor(list, 1, 'ArrowDown'), 2);
  assert.equal(spatialNeighbor([], 0, 'ArrowDown'), -1);
});
