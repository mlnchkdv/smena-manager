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
  assert.ok(clustered.clusters.every(node => node.kind === 'group' && node.memberCount === 100 && node.dominantKind === 'task'));
});

test('folder aggregates remain groups with typed composition and exact internal/external totals', () => {
  const nodes = [0, 1, 2].map(index => ({ key: `note:${index}`, kind: 'note', title: `Note ${index}`, item: { folderId: 'folder' } }));
  nodes.push({ key: 'project:p', kind: 'project', title: 'Real project', item: { id: 'p' } });
  const graph = {
    nodes,
    edges: [
      { from: 'note:0', to: 'note:1', type: 'related' },
      { from: 'note:1', to: 'project:p', type: 'related' },
      { from: 'project:p', to: 'note:2', type: 'related' },
    ],
  };
  const result = clusterGraph(graph),
    group = result.clusters[0];
  assert.equal(group.kind, 'group');
  assert.equal(group.groupType, 'note-folder');
  assert.deepEqual(group.kindCounts, { note: 3 });
  assert.equal(group.memberCount, 3);
  assert.equal(group.internalEdges, 1);
  assert.equal(group.externalEdges, 2);
  assert.equal(result.nodes.find(node => node.key === 'project:p').kind, 'project');
  const expanded = clusterGraph(graph, { expanded: [group.clusterId] });
  assert.deepEqual(
    expanded.nodes.map(node => node.key),
    nodes.map(node => node.key),
  );
});
