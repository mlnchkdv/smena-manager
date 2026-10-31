import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDiagramViews, validDiagramViews, diagramPreferences, diagramLayoutChanged } from '../../src/shared/diagram-views.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
const graph = () => ({
  id: 'g',
  name: 'Overview',
  kind: 'graph',
  project: '',
  context: { center: '', query: 'type:note', kind: 'note', project: '', connected: '', archive: '', depth: 1 },
  layout: { positions: [{ id: 'note:a', x: 100, y: 200, locked: true }], zoom: 1, pan: { x: 10, y: 20 }, width: 800, height: 500 },
});
test('named diagram views validate positions active scopes limits and legacy migration', () => {
  const cfg = { ...defaultDiagramViews(), items: [graph()], active: ['g'], pins: [{ id: 'note:a', x: 100, y: 200, locked: true }] };
  assert.equal(validDiagramViews(cfg), true);
  assert.equal(validDiagramViews({ ...cfg, items: [{ ...graph(), layout: { ...graph().layout, zoom: Infinity } }] }), false);
  assert.equal(validDiagramViews({ ...cfg, active: ['missing'] }), false);
  assert.equal(validDiagramViews({ ...cfg, items: [graph(), { ...graph(), id: 'g2' }], active: ['g', 'g2'] }), false);
  assert.deepEqual(diagramPreferences('{"version":0}'), defaultDiagramViews());
  const db = { members: [{ id: 'a' }, { id: 'b' }] };
  applyPersonalSettings(db, 'a', { preferences: { diagramViews: JSON.stringify(cfg) } });
  assert.equal(db._userPrefs.b, undefined);
  assert.equal(JSON.parse(db._userPrefs.a.diagramViews).items[0].layout.positions[0].x, 100);
});

test('layout change detection tolerates numeric jitter but detects position camera pin and outline changes', () => {
  const saved = graph().layout;
  assert.equal(diagramLayoutChanged('graph', saved, structuredClone(saved)), false);
  const changed = structuredClone(saved);
  changed.positions[0].x += 20;
  assert.equal(diagramLayoutChanged('graph', saved, changed), true);
  changed.positions[0].x = saved.positions[0].x;
  changed.positions[0].locked = false;
  assert.equal(diagramLayoutChanged('graph', saved, changed), true);
  const board = { x: 1, y: 2, zoom: 1, outline: false };
  assert.equal(diagramLayoutChanged('board', board, { ...board, x: 1.001 }), false);
  assert.equal(diagramLayoutChanged('board', board, { ...board, outline: true }), true);
});
