import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterGraph } from '../../src/shared/graph-clusters.js';
test('semantic clusters preserve internal and external edge counts and reveal searched or selected nodes', () => {
  const nodes = Array.from({ length: 10000 }, (_, i) => ({ key: `task:${i}`, kind: 'task', title: `Task ${i}`, project: `p${Math.floor(i / 100)}`, item: {} }));
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].key, to: node.key, type: 'related' }));
  const graph = { nodes, edges };
  const clustered = clusterGraph(graph);
  assert.equal(clustered.nodes.length, 100);
  assert.equal(
    clustered.clusters.reduce((sum, node) => sum + node.internalEdges, 0) + clustered.edges.reduce((sum, edge) => sum + edge.count, 0),
    edges.length,
  );
  assert.deepEqual(
    clusterGraph(graph).nodes.map(node => node.key),
    clustered.nodes.map(node => node.key),
  );
  assert.ok(clusterGraph(graph, { selected: 'task:5' }).nodes.some(node => node.key === 'task:5'));
  assert.equal(clusterGraph(graph, { expanded: ['project:p0'] }).nodes.length, 199);
  assert.equal(clusterGraph(graph, { reveal: true }).nodes.length, 10000);
  assert.equal(graph.nodes.length, 10000);
});
