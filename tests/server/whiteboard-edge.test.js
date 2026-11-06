import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteboardEdgeGeometry, whiteboardEdgeText, whiteboardDiffVisibleIds } from '../../src/shared/whiteboard-edge.js';
import { compareWhiteboards } from '../../src/shared/whiteboard-comparison.js';

const a = { id: 'a', title: 'Origin / Источник', x: 0, y: 0, width: 160, height: 100 },
  b = { id: 'b', title: 'Target / Результат', x: 400, y: 0, width: 160, height: 100 };
const edge = { id: 'e', from: 'a', to: 'b', label: 'Full connection label / Полная подпись связи', arrow: true, color: 'blue' };
test('comparison arrows terminate outside card boundaries and reverse toward the actual target', () => {
  const forward = whiteboardEdgeGeometry(a, b),
    reverse = whiteboardEdgeGeometry(b, a);
  assert.ok(forward.x1 > a.x + a.width && forward.x2 < b.x);
  assert.ok(reverse.x1 < b.x && reverse.x2 > a.x + a.width);
  assert.ok(forward.x1 < forward.x2);
  assert.ok(reverse.x1 > reverse.x2);
  assert.equal(forward.head.split(' ').length, 3);
  assert.equal(whiteboardEdgeGeometry(a, a), null);
});
test('text alternatives expose label, color and directed/undirected semantics in both versions', () => {
  const board = { nodes: [a, b], edges: [edge] };
  const current = whiteboardEdgeText(board, edge);
  const old = whiteboardEdgeText(board, { ...edge, from: 'b', to: 'a', label: 'Previous', arrow: false, color: 'rose' });
  assert.match(current, /Origin.*→.*Target/);
  assert.match(current, /Full connection label.*Directed.*blue/);
  assert.match(old, /Target.*—.*Origin/);
  assert.match(old, /Previous.*No arrow.*rose/);
  const ru = whiteboardEdgeText(board, { ...edge, arrow: false, label: '' }, { noLabel: 'Без подписи', undirected: 'Без стрелки', colors: { blue: 'Синий' } });
  assert.match(ru, /Без подписи.*Без стрелки.*Синий/);
});
test('changed-only context includes unchanged connection endpoints and both endpoints of removed edges', () => {
  const previous = { nodes: [a, b], edges: [edge] },
    current = { nodes: [{ ...a, title: 'Updated' }, b], edges: [edge] };
  assert.deepEqual([...whiteboardDiffVisibleIds(current, previous, compareWhiteboards(current, previous).rows)].sort(), ['a', 'b']);
  const removed = { nodes: [a], edges: [] };
  assert.deepEqual([...whiteboardDiffVisibleIds(removed, previous, compareWhiteboards(removed, previous).rows)].sort(), ['a', 'b']);
  const arrowOnly = { nodes: [a, b], edges: [{ ...edge, arrow: false }] };
  assert.deepEqual([...whiteboardDiffVisibleIds(arrowOnly, previous, compareWhiteboards(arrowOnly, previous).rows)].sort(), ['a', 'b']);
});
