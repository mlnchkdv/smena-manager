import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardOverviewLabels } from '../../src/shared/whiteboard-overview.js';

test('overlapping overview labels prioritize selection and then frames without mutating input', () => {
  const box = { left: 20, right: 100, top: 20, bottom: 34, width: 80, height: 14 };
  const cards = [
    { id: 'a', box },
    { id: 'frame', frame: true, box },
    { id: 'b', box: { ...box, left: 150, right: 230 } },
  ];
  const before = structuredClone(cards),
    bounds = { left: 0, top: 0, right: 320, bottom: 500, width: 320, height: 500 };
  assert.deepEqual([...whiteboardOverviewLabels(cards, bounds)], ['frame', 'b']);
  assert.deepEqual([...whiteboardOverviewLabels(cards, bounds, 'a')], ['a', 'b']);
  assert.deepEqual(cards, before);
});
test('offscreen and clipped secondary labels are suppressed, not their cards', () => {
  const bounds = { left: 0, top: 0, right: 320, bottom: 500, width: 320, height: 500 };
  const cards = [{ id: 'clipped', box: { left: -10, top: 20, right: 50, bottom: 35, width: 60, height: 15 } }];
  assert.equal(whiteboardOverviewLabels(cards, bounds).size, 0);
  assert.equal(whiteboardOverviewLabels(cards, bounds, 'clipped').size, 1);
  assert.equal(cards.length, 1);
});
