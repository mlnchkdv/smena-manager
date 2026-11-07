import test from 'node:test';
import assert from 'node:assert/strict';
import { graphEntryPlan } from '../../src/shared/graph-entry-plan.js';
import { clusterGraph } from '../../src/shared/graph-clusters.js';
const graph = {
  nodes: Array.from({ length: 250 }, (_, i) => ({
    key: 'note:' + i,
    kind: i === 0 ? 'project' : 'note',
    title: 'Material ' + i,
    item: { folderId: 'folder' + i },
  })),
  edges: Array.from({ length: 249 }, (_, i) => ({ from: 'note:0', to: 'note:' + (i + 1), type: 'related', origin: 'manual' })),
  total: 2000,
};
test('dense graph entry respects explicit choices, saved views, local centers and search', () => {
  const plan = graphEntryPlan(graph);
  assert.equal(plan.automatic, true);
  assert.equal(plan.grouped, true);
  assert.equal(plan.entries[0].count, 250);
  assert.equal(plan.entries[0].key, 'note:0');
  for (const options of [{ preference: false }, { savedView: true }, { center: 'note:2' }, { query: 'Material' }])
    assert.equal(graphEntryPlan(graph, options).automatic, false);
  assert.equal(graphEntryPlan(graph, { preference: false }).grouped, false);
  assert.equal(graphEntryPlan(graph, { preference: true }).grouped, true);
  assert.deepEqual(graphEntryPlan({ ...graph, nodes: graph.nodes.slice().reverse(), edges: graph.edges.slice().reverse() }).entries, plan.entries);
});
test('entry counts include visible materials only and ignore edges outside the authorized view', () => {
  const view = { nodes: graph.nodes.slice(0, 3), edges: [...graph.edges, { from: 'private', to: 'note:0' }], total: 2000 };
  assert.equal(graphEntryPlan(view).entries[0].count, 3);
  assert.ok(!JSON.stringify(graphEntryPlan(view)).includes('private'));
});
test('dense sparse folders collapse coherently while selection and explicit expansion stay reachable', () => {
  const grouped = clusterGraph(graph, { dense: true });
  assert.equal(grouped.nodes.length, 2);
  assert.equal(grouped.clusters[0].memberCount, 249);
  assert.equal(grouped.edges.length, 1);
  assert.equal(grouped.edges[0].count, 249);
  const selected = clusterGraph(graph, { dense: true, selected: 'note:2' });
  assert.ok(selected.nodes.some(n => n.key === 'note:2'));
  const expanded = clusterGraph(graph, { dense: true, expanded: ['kind:note'] });
  assert.equal(expanded.nodes.length, 250);
  assert.equal(clusterGraph(graph, { dense: true, reveal: true }).nodes.length, 250);
});
