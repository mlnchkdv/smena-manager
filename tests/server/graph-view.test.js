import assert from 'node:assert/strict';
import test from 'node:test';
import { graphView } from '../../src/shared/graph-view.js';
import { appLocationPath, resolveAppLocation } from '../../src/shared/app-location.js';
const graph = {
  nodes: [
    { key: 'note:a', kind: 'note', title: 'Review', tags: ['Команда'] },
    { key: 'file:f', kind: 'file', title: 'Guide', project: 'p' },
    { key: 'project:p', kind: 'project', title: 'P', project: 'p' },
    { key: 'bookmark:l', kind: 'bookmark', title: 'Lonely' },
  ],
  edges: [
    { from: 'note:a', to: 'file:f' },
    { from: 'file:f', to: 'project:p' },
  ],
  unresolved: [],
};
test('local graph depth, typed search, project and orphan filters compose without dangling edges', () => {
  assert.equal(graphView(graph, { center: 'note:a', depth: 1 }).nodes.length, 2);
  assert.equal(graphView(graph, { center: 'note:a', depth: 2 }).nodes.length, 3);
  assert.equal(graphView(graph, { query: ' КОМАНДА ' }).nodes[0].key, 'note:a');
  assert.equal(graphView(graph, { kind: 'file', project: 'p' }).nodes.length, 1);
  assert.equal(graphView(graph, { connectedOnly: true }).nodes.length, 3);
  assert.equal(graphView(graph, { center: 'missing' }).nodes.length, 0);
  assert.equal(graphView(graph, { kind: 'file' }).edges.length, 0);
});
test('graph views are bounded and stable-ID local routes survive reload', () => {
  const large = { nodes: Array.from({ length: 10000 }, (_, i) => ({ key: `note:${i}`, kind: 'note', title: String(i), tags: [] })), edges: [], unresolved: [] };
  assert.equal(graphView(large).nodes.length, 250);
  assert.equal(graphView(large).total, 10000);
  assert.equal(graphView(large, { limit: Infinity }).nodes.length, 10000, 'Explicit exports include the full filtered graph, not just the visual window');
  const path = appLocationPath({ ws: { url: 'smena' } }, { route: 'graph', params: { center: 'note:a' }, modals: [] });
  assert.equal(path, '/smena/graph/note%3Aa');
  assert.deepEqual(resolveAppLocation(path, '', {}), { route: 'graph', params: { center: 'note:a' } });
});

test('large graph views expose truncation metadata for progressive rendering', () => {
  const graph = {
    nodes: Array.from({ length: 600 }, (_, index) => ({ key: `note:${index}`, title: `Note ${index}` })),
    edges: [],
    unresolved: [],
  };
  const view = graphView(graph, { limit: 250 });
  assert.equal(view.nodes.length, 250);
  assert.equal(view.visibleTotal, 250);
  assert.equal(view.visibleEdgeTotal, 0);
  assert.equal(view.total, 600);
  assert.equal(view.truncated, true);
  assert.equal(view.limit, 250);
});
