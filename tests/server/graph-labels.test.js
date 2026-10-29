import test from 'node:test';
import assert from 'node:assert/strict';
import { graphOverviewLabels } from '../../src/shared/graph-labels.js';

test('overview labels prioritize selected material and leave room between labels', () => {
  const graph = {
    nodes: ['a', 'b', 'c', 'd'].map(key => ({ key })),
    edges: [
      { from: 'b', to: 'c' },
      { from: 'b', to: 'd' },
    ],
  };
  const points = new Map([
    ['a', { x: 80, y: 70 }],
    ['b', { x: 82, y: 72 }],
    ['c', { x: 220, y: 180 }],
    ['d', { x: 10, y: 390 }],
  ]);
  assert.deepEqual([...graphOverviewLabels(graph, points, { width: 320, height: 430 })], ['b', 'c']);
  assert.deepEqual([...graphOverviewLabels(graph, points, { width: 320, height: 430, selected: 'a' })], ['a', 'c']);
  assert.equal(graphOverviewLabels(graph, points, { width: 320, height: 430, limit: 1 }).size, 1);
  assert.equal(points.get('a').x, 80);
});

test('label density scales with available screen area for large collections', () => {
  for (const count of [100, 500, 1000]) {
    const nodes = Array.from({ length: count }, (_, index) => ({ key: String(index) }));
    const points = new Map(nodes.map((node, index) => [node.key, { x: 80 + (index % 12) * 150, y: 40 + Math.floor(index / 12) * 90 }]));
    const graph = { nodes, edges: [] };
    const phone = graphOverviewLabels(graph, points, { width: 320, height: 430, selected: '0' });
    const desktop = graphOverviewLabels(graph, points, { width: 1920, height: 1080, selected: '0' });
    assert.ok(phone.has('0') && desktop.has('0'));
    assert.ok(desktop.size > phone.size && desktop.size <= 18);
  }
});
