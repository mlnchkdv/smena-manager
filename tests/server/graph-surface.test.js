import test from 'node:test';
import assert from 'node:assert/strict';
import { retainGraphSurface } from '../../src/shared/graph-surface.js';
import { graphRenderKey } from '../../src/shared/graph-render-key.js';

test('background shell replacement preserves the authorized canvas identity but never crosses a session or topology boundary', () => {
  const old = { dataset: { graphScope: 'session-a', graphTopology: 'a-b' }, setAttribute() {} };
  let kept;
  const replacement = {
    dataset: { graphTopology: 'a-b' },
    getAttribute: () => 'Graph',
    replaceWith: node => {
      kept = node;
    },
  };
  assert.equal(retainGraphSurface(old, replacement, 'session-a'), true);
  assert.equal(kept, old);
  kept = null;
  assert.equal(retainGraphSurface(old, replacement, 'session-b'), false);
  replacement.dataset.graphTopology = 'a';
  assert.equal(retainGraphSurface(old, replacement, 'session-a'), false);
  assert.equal(retainGraphSurface(old, null, 'session-a'), false);
  assert.equal(kept, null);
});

test('renderer identity ignores response ordering but responds to material, access-view and display changes', () => {
  const graph = {
    nodes: [
      { key: 'a', title: 'A', kind: 'note' },
      { key: 'b', title: 'B', kind: 'file' },
    ],
    edges: [{ from: 'a', to: 'b', origin: 'manual' }],
  };
  const key = graphRenderKey(graph, ['owner', 'light', false]);
  assert.equal(key, graphRenderKey({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges] }, ['owner', 'light', false]));
  assert.notEqual(key, graphRenderKey(graph, ['another-owner', 'light', false]));
  assert.notEqual(key, graphRenderKey(graph, ['owner', 'light', true]));
  assert.notEqual(key, graphRenderKey({ ...graph, nodes: graph.nodes.slice(0, 1) }, ['owner', 'light', false]));
  assert.notEqual(key, graphRenderKey({ ...graph, nodes: graph.nodes.map(n => ({ ...n, title: n.title + ' changed' })) }, ['owner', 'light', false]));
});

test('retention moves the wrapper, keeping the Cytoscape container under its original observed parent', () => {
  const surface = { dataset: { graphScope: 'session', graphTopology: 'a-b' }, setAttribute() {} };
  const canvas = { parentElement: surface };
  const replacement = { dataset: { graphTopology: 'a-b' }, getAttribute: () => 'Graph', replaceWith: element => assert.equal(element, surface) };
  retainGraphSurface(surface, replacement, 'session');
  assert.equal(canvas.parentElement, surface);
});
