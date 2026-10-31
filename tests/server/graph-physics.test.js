import test from 'node:test';
import assert from 'node:assert/strict';
import cytoscape from 'cytoscape';
import { graphPhysicsOptions } from '../../src/shared/graph-physics.js';
import { disposeGraph } from '../../src/shared/graph-disposal.js';

test('retiring a running layout drains its queued final position before destroying the renderer', () => {
  const calls = [],
    frames = [() => calls.push('final positions')];
  let destroyed = false;
  const cy = {
    destroyed: () => destroyed,
    removeAllListeners: () => calls.push('detach graph'),
    destroy: () => {
      destroyed = true;
      calls.push('destroy');
    },
  };
  const layout = { removeAllListeners: () => calls.push('detach layout'), stop: () => calls.push('stop') };
  disposeGraph(cy, layout, frame => frames.push(frame));
  assert.equal(destroyed, false);
  while (frames.length) frames.shift()();
  assert.deepEqual(calls, ['detach graph', 'detach layout', 'stop', 'final positions', 'destroy']);
  disposeGraph(cy, layout, () => assert.fail('already retired'));
});

test('graphs whose stopped layout reference was cleared still drain before destruction', () => {
  const cy = cytoscape({ headless: true });
  let cleanup;
  disposeGraph(cy, null, frame => {
    cleanup = frame;
  });
  assert.equal(cy.destroyed(), false);
  cleanup();
  assert.equal(cy.destroyed(), true);
});
test('bounded graph physics redistributes nodes while preserving graph identities', async () => {
  const cy = cytoscape({
    headless: true,
    elements: [
      ...Array.from({ length: 100 }, (_, i) => ({ data: { id: String(i) }, position: { x: i * 160, y: (i % 3) * 120 } })),
      ...Array.from({ length: 99 }, (_, i) => ({ data: { id: `e${i}`, source: String(i), target: String(i + 1) } })),
    ],
    layout: { name: 'preset' },
  });
  try {
    const before = cy.nodes().map(n => ({ ...n.position() }));
    const layout = cy.layout(graphPhysicsOptions(true));
    const done = new Promise(resolve => layout.one('layoutstop', resolve));
    layout.run();
    await done;
    assert.equal(cy.nodes().length, 100);
    assert.equal(cy.edges().length, 99);
    assert.ok(cy.nodes().every(n => Number.isFinite(n.position().x) && Number.isFinite(n.position().y)));
    assert.ok(cy.nodes().some((n, i) => Math.hypot(n.position().x - before[i].x, n.position().y - before[i].y) > 10));
    assert.equal(graphPhysicsOptions(true).animate, false);
    assert.equal(graphPhysicsOptions(false).animate, true);
  } finally {
    cy.destroy();
  }
});
