import { whiteboardCatalogProjection, restoreWhiteboardBodies } from '../../src/server/whiteboard-catalog.js';
import { hydrateWhiteboards, wantWhiteboard, whiteboardCatalogWrite, whiteboardBodyAvailable } from '../../src/core/whiteboard-catalog-transport.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEntityDefaults } from '../../src/shared/workspace-defaults.js';
import { canReadWhiteboard, canEditWhiteboard, migrateProjectWhiteboards, validWhiteboardDocument } from '../../src/shared/whiteboards.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { captureWhiteboardHistory, whiteboardVersions } from '../../src/server/whiteboard-history.js';
import { workspaceGraph, entityAllowed } from '../../src/shared/relations.js';
import { searchWorkspace } from '../../src/shared/workspace-search.js';
const board = text => ({
  version: 1,
  nodes: [{ id: 'card', type: 'text', x: 0, y: 0, width: 220, height: 140, color: 'neutral', title: 'Title', text }],
  edges: [],
});
const fixture = () =>
  applyEntityDefaults({
    me: 'owner',
    members: [{ id: 'owner' }, { id: 'other' }],
    projects: [
      { id: 'secret', name: 'Private', private: true, members: ['owner'], whiteboard: board('Private text') },
      { id: 'empty', name: 'Empty' },
    ],
    tasks: [],
    comments: [],
    files: [],
    events: [],
    savedViews: [],
    activity: [],
    notifs: [],
    trash: [],
    projOrder: [],
    relations: [],
  });
test('legacy migration preserves contents rights history and archived identity without empty catalog noise', () => {
  const data = fixture();
  assert.equal(data.whiteboards.length, 1);
  assert.equal(data.whiteboards[0].id, 'secret');
  assert.equal(validWhiteboardDocument(data.whiteboards[0]), true);
  assert.equal(data.whiteboards[0].whiteboard.nodes[0].text, 'Private text');
  assert.equal(canReadWhiteboard(data, data.whiteboards[0], 'other', 'editor'), false);
  data.whiteboards[0].archived = true;
  migrateProjectWhiteboards(data);
  assert.equal(data.whiteboards.length, 1);
  assert.equal(data.whiteboards[0].archived, true);
  assert.equal(projectWorkspace(data, { id: 'other', role: 'editor' }).whiteboards.length, 0);
});
test('standalone edits and legacy project edits share one board and history without losing private filtered records', () => {
  const data = fixture(),
    incoming = structuredClone(projectWorkspace(data, { id: 'owner', role: 'editor' }));
  incoming.whiteboards[0].whiteboard.nodes[0].text = 'Standalone edit';
  const next = mergeClientWorkspace(data, incoming, 'editor', 'owner');
  assert.equal(next.projects[0].whiteboard.nodes[0].text, 'Standalone edit');
  captureWhiteboardHistory(data, next, 'owner');
  assert.equal(whiteboardVersions(next, 'secret')[0].board.nodes[0].text, 'Private text');
  const legacy = structuredClone(projectWorkspace(next, { id: 'owner', role: 'editor' }));
  delete legacy.whiteboards;
  legacy.projects[0].whiteboard.nodes[0].text = 'Legacy edit';
  const updated = mergeClientWorkspace(next, legacy, 'editor', 'owner');
  assert.equal(updated.whiteboards.length, 1);
  assert.equal(updated.whiteboards[0].whiteboard.nodes[0].text, 'Legacy edit');
  const filtered = projectWorkspace(updated, { id: 'other', role: 'editor' });
  assert.equal(mergeClientWorkspace(updated, filtered, 'editor', 'other').whiteboards[0].whiteboard.nodes[0].text, 'Legacy edit');
});
test('independent shared boards are writable by editors but closed project relinking forged authors and hard removal are rejected', () => {
  const data = fixture(),
    input = projectWorkspace(data, { id: 'other', role: 'editor' });
  input.whiteboards.push({
    id: 'free',
    name: 'Free',
    desc: '',
    project: '',
    by: 'other',
    at: '2026-10-31T00:00:00Z',
    archived: false,
    whiteboard: board('Shared'),
  });
  const next = mergeClientWorkspace(data, input, 'editor', 'other');
  assert.equal(next.whiteboards.find(b => b.id === 'free').by, 'other');
  assert.equal(canEditWhiteboard(next, next.whiteboards[1], 'other', 'viewer'), false);
  const visible = projectWorkspace(next, { id: 'other', role: 'editor' });
  const detach = structuredClone(visible);
  detach.whiteboards[0].project = 'secret';
  assert.throws(
    () => mergeClientWorkspace(next, detach, 'editor', 'other'),
    e => e.code === 'ENTITY_FORBIDDEN',
  );
  const remove = structuredClone(visible);
  remove.whiteboards = [];
  assert.throws(
    () => mergeClientWorkspace(next, remove, 'editor', 'other'),
    e => e.code === 'ENTITY_FORBIDDEN',
  );
  const forge = structuredClone(visible);
  forge.whiteboards[0].by = 'owner';
  assert.throws(
    () => mergeClientWorkspace(next, forge, 'editor', 'other'),
    e => e.code === 'ENTITY_FORBIDDEN',
  );
  const archived = structuredClone(next);
  archived.whiteboards.find(b => b.id === 'free').archived = true;
  const changing = projectWorkspace(archived, { id: 'other', role: 'editor' });
  changing.whiteboards[0].whiteboard.nodes[0].text = 'Cannot edit archive';
  assert.throws(
    () => mergeClientWorkspace(archived, changing, 'editor', 'other'),
    e => e.code === 'ENTITY_FORBIDDEN',
  );
});
test('independent whiteboards join graph and search without exposing closed project material', () => {
  const data = fixture();
  data.me = 'other';
  data.whiteboards.push({
    id: 'shared',
    name: 'Shared diagram',
    desc: 'Public description',
    project: '',
    archived: false,
    by: 'owner',
    at: '2026-10-31T00:00:00Z',
    whiteboard: board('Searchable idea'),
  });
  data.whiteboards[1].whiteboard.nodes.push({
    id: 'private-reference',
    type: 'material',
    x: 300,
    y: 0,
    width: 200,
    height: 120,
    color: 'neutral',
    target: 'project:secret',
  });
  const graph = workspaceGraph(data, { memberId: 'other', role: 'editor' });
  assert.equal(
    graph.nodes.some(n => n.key === 'whiteboard:shared'),
    true,
  );
  assert.equal(
    graph.nodes.some(n => n.key === 'whiteboard:secret'),
    false,
  );
  assert.equal(
    graph.edges.some(e => e.to === 'project:secret'),
    false,
  );
  assert.equal(entityAllowed(data, 'whiteboard:secret', { memberId: 'other', role: 'editor' }), false);
  assert.equal(searchWorkspace(data, 'Searchable idea', { role: 'editor' }).whiteboards[0].id, 'shared');
  assert.equal(searchWorkspace(data, 'Private text', { role: 'editor' }).whiteboards.length, 0);
  data.whiteboards[1].archived = true;
  assert.equal(searchWorkspace(data, 'Searchable idea', { role: 'editor' }).whiteboards.length, 0);
});

test('whiteboard demand catalog omits bodies and aliases while metadata edits preserve canonical content', async () => {
  const data = fixture();
  data.revision = 9;
  const wire = whiteboardCatalogProjection(projectWorkspace(data, { id: 'owner', role: 'admin' }));
  assert.equal(wire.data.whiteboards[0].whiteboard, undefined);
  assert.equal(wire.data.projects[0].whiteboard, undefined);
  assert.equal(JSON.stringify(wire).includes('Private text'), false);
  let calls = 0;
  const send = async () => {
    calls++;
    return { board: data.whiteboards[0].whiteboard, hash: wire.whiteboardCatalog.entries[0].hash, revision: 9 };
  };
  const unloaded = await hydrateWhiteboards(wire, send, 'demand-one');
  assert.equal(calls, 0);
  assert.equal(whiteboardBodyAvailable('secret'), false);
  const metadata = whiteboardCatalogWrite(unloaded, 'demand-one');
  metadata.whiteboards[0].name = 'Renamed';
  const merged = mergeClientWorkspace(data, restoreWhiteboardBodies(data, metadata), 'admin', 'owner');
  assert.equal(merged.whiteboards[0].whiteboard.nodes[0].text, 'Private text');
  assert.equal(merged.projects[0].whiteboard.nodes[0].text, 'Private text');
  wantWhiteboard('secret', 'demand-one');
  const loaded = await hydrateWhiteboards(wire, send, 'demand-one');
  assert.equal(calls, 1);
  assert.equal(whiteboardBodyAvailable('secret'), true);
  assert.equal(whiteboardCatalogWrite(loaded, 'demand-one').whiteboards[0].whiteboard, undefined);
  loaded.whiteboards[0].whiteboard.nodes[0].text = 'Edited body';
  const edit = whiteboardCatalogWrite(loaded, 'demand-one');
  assert.equal(edit.whiteboards[0].whiteboard.nodes[0].text, 'Edited body');
  assert.equal(mergeClientWorkspace(data, restoreWhiteboardBodies(data, edit), 'admin', 'owner').whiteboards[0].whiteboard.nodes[0].text, 'Edited body');
  const hidden = whiteboardCatalogProjection(projectWorkspace(data, { id: 'other', role: 'editor' }));
  await hydrateWhiteboards(hidden, send, 'demand-other');
  assert.equal(whiteboardBodyAvailable('secret'), false);
  assert.equal(hidden.whiteboardCatalog.entries.length, 0);
  assert.throws(() => restoreWhiteboardBodies(data, { whiteboards: [{ id: 'unknown' }] }), /requires its content/);
  assert.equal(data.whiteboards[0].whiteboard.nodes[0].text, 'Private text');
});
