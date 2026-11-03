import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphDragPhysics } from '../../src/shared/graph-drag-physics.js';

const nodes = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 200, y: 0 },
  { id: 'other', x: 500, y: 0 },
];
const edges = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c' },
];
test('drag pulls the entire connected cluster, leaves separate components out and keeps the source immutable', () => {
  const original = structuredClone(nodes),
    motion = createGraphDragPhysics(nodes, edges, 'a');
  assert.equal(motion.size, 3);
  let frame;
  for (let i = 0; i < 120; i++) frame = motion.step({ x: 160, y: 80 });
  assert.ok(Math.abs(frame.positions.get('b').x - 260) < 1);
  assert.ok(Math.abs(frame.positions.get('c').y - 80) < 1);
  assert.equal(frame.positions.has('other'), false);
  assert.deepEqual(nodes, original);
  assert.equal(frame.settled, true);
});
test('a click without movement is inert, pins remain fixed and reduced motion has no follow-up animation', () => {
  const motion = createGraphDragPhysics(nodes, edges, 'a');
  assert.deepEqual(
    [...motion.step({ x: 0, y: 0 }).positions.values()],
    nodes.slice(0, 3).map(({ x, y }) => ({ x, y })),
  );
  const pinned = createGraphDragPhysics(
    nodes.map(n => ({ ...n, locked: n.id === 'b' })),
    edges,
    'a',
  );
  let frame;
  for (let i = 0; i < 100; i++) frame = pinned.step({ x: 100, y: 50 });
  assert.deepEqual(frame.positions.get('b'), { x: 100, y: 0 });
  assert.equal(
    createGraphDragPhysics(
      nodes.map(n => ({ ...n, locked: true })),
      edges,
      'a',
    ),
    null,
  );
  const reduced = createGraphDragPhysics(nodes, edges, 'a', { reducedMotion: true }).step({ x: 100, y: 50 });
  assert.equal(reduced.settled, true);
  assert.deepEqual(reduced.positions.get('c'), { x: 300, y: 50 });
});
test('large loaded components remain finite during a long drag', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: String(i), x: i * 50, y: (i % 3) * 40 }));
  const links = many.slice(1).map((n, i) => ({ from: String(i), to: n.id }));
  const motion = createGraphDragPhysics(many, links, '0');
  for (let i = 0; i < 100; i++) {
    const frame = motion.step({ x: 2000, y: -1000 });
    assert.ok([...frame.positions.values()].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});
