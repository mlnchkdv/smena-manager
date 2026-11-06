import test from 'node:test';
import assert from 'node:assert/strict';
import { graphSemanticView } from '../../src/shared/graph-semantic-view.js';

test('dense phone overviews use bounded dots and labels, then restore detail when zoomed or sparse', () => {
  for (const nodes of [81, 250, 500]) {
    const phone = graphSemanticView({ width: 320, height: 430, nodes, zoom: 0.2 });
    assert.equal(phone.overview, true);
    assert.ok(phone.pointPixels >= 6 && phone.pointPixels <= 12);
    assert.equal(phone.labelLimit, 2);
    assert.equal(graphSemanticView({ width: 320, height: 430, nodes, zoom: 0.9 }).overview, false);
    assert.equal(graphSemanticView({ width: 1366, height: 600, nodes, zoom: 0.2 }).overview, false);
  }
  assert.equal(graphSemanticView({ width: 390, height: 600, nodes: 20, zoom: 0.2 }).overview, false);
});
