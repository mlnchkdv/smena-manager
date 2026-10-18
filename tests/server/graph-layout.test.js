import assert from 'node:assert/strict';
import test from 'node:test';
import { graphPositions, graphTopologyKey } from '../../src/shared/graph-layout.js';

test('component layout is deterministic with unique finite positions for linked and isolated materials', () => {
  const graph = {
    nodes: Array.from({ length: 250 }, (_, i) => ({ key: `note:${i}` })),
    edges: Array.from({ length: 100 }, (_, i) => ({ from: 'note:0', to: `note:${i + 1}` })),
  };
  const positions = graphPositions(graph);
  assert.equal(positions.size, 250);
  assert.equal(new Set([...positions.values()].map(point => `${point.x},${point.y}`)).size, 250);
  assert.ok([...positions.values()].every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.deepEqual([...graphPositions({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() })], [...positions]);
});

test('viewport signatures change on filters/topology changes, not selection or titles', () => {
  const graph = { nodes: [{ key: 'note:a', title: 'Old' }, { key: 'note:b' }], edges: [{ from: 'note:a', to: 'note:b' }] };
  const signature = graphTopologyKey(graph);
  graph.nodes[0].title = 'Renamed';
  assert.equal(graphTopologyKey(graph), signature);
  assert.notEqual(graphTopologyKey({ nodes: [graph.nodes[0]], edges: [] }), signature);
  assert.notEqual(graphTopologyKey({ ...graph, edges: [] }), signature);
  assert.deepEqual([...graphPositions({ nodes: [], edges: [] })], []);
});
