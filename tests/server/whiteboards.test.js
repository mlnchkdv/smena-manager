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
