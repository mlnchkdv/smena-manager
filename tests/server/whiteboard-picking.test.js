import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardPickCandidates } from '../../src/shared/whiteboard-picking.js';

test('overview picking uses screen-sized targets and preserves overlapping choices', () => {
  const nodes = [
    { id: 'a', type: 'text', x: 100, y: 100, width: 160, height: 100 },
    { id: 'b', type: 'text', x: 180, y: 100, width: 160, height: 100 },
  ];
  const before = JSON.stringify(nodes);
  assert.deepEqual(whiteboardPickCandidates(nodes, { x: 135, y: 100 }, { x: 100, y: 70, zoom: 0.2 }), ['a', 'b']);
  assert.deepEqual(whiteboardPickCandidates(nodes, { x: 20, y: 20 }, { x: 100, y: 70, zoom: 0.2 }), []);
  assert.deepEqual(whiteboardPickCandidates(nodes, { x: 220, y: 220 }, { x: 0, y: 0, zoom: 2 }), ['a']);
  assert.equal(JSON.stringify(nodes), before);
});

test('frame interiors do not capture their child cards and invalid cameras yield no candidates', () => {
  const nodes = [
    { id: 'frame', type: 'group', x: 0, y: 0, width: 1000, height: 1000 },
    { id: 'card', type: 'text', x: 400, y: 400, width: 200, height: 100 },
  ];
  assert.deepEqual(whiteboardPickCandidates(nodes, { x: 240, y: 220 }, { x: 0, y: 0, zoom: 0.5 }), ['card']);
  assert.deepEqual(whiteboardPickCandidates(nodes, { x: 100, y: 10 }, { x: 0, y: 0, zoom: 0.5 }), ['frame']);
  assert.deepEqual(whiteboardPickCandidates(nodes, { x: 0, y: 0 }, { x: 0, y: 0, zoom: 0 }), []);
});
