import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWikiReferences, graphNeighborhood, workspaceGraph } from '../../src/shared/relations.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { mergeWorkspaceData } from '../../src/shared/workspace-merge.js';
import { buildPortableWorkspace, mergePortableWorkspace } from '../../src/shared/portable-workspace.js';
import { validateWorkspaceData } from '../../src/shared/workspace-schema.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';

const fixture = () => ({
  me: 'editor',
  projects: [{ id: 'p' }, { id: 'secret', private: true }],
  tasks: [
    { id: 't', project: 'p' },
    { id: 'hidden', project: 'secret' },
  ],
  knowledgeNotes: [
    { id: 'a', title: 'Регламент', formatted_markdown: '[[Review]]' },
    { id: 'b', title: 'Review' },
  ],
  links: [{ id: 'l', title: 'Source' }],
  relations: [{ id: 'r', from: 'note:a', to: 'task:hidden', type: 'related' }],
});

test('wiki bindings survive rename, avoid duplicate titles, and remove obsolete text references', () => {
  const data = fixture();
  bindWikiReferences(data.knowledgeNotes);
  data.knowledgeNotes[1].title = 'Renamed';
  bindWikiReferences(data.knowledgeNotes);
  assert.equal(data.knowledgeNotes[0].wikiRefs[0].target, 'b');
  assert.ok(workspaceGraph(data, { role: 'editor' }).edges.some(edge => edge.to === 'note:b'));
  data.knowledgeNotes[0].formatted_markdown = '';
  bindWikiReferences(data.knowledgeNotes);
  assert.deepEqual(data.knowledgeNotes[0].wikiRefs, []);
  const ambiguous = [
    { id: 'a', formatted_markdown: '[[Same]]' },
    { id: 'b', title: 'Same' },
    { id: 'c', title: 'Same' },
  ];
  bindWikiReferences(ambiguous);
  assert.equal(ambiguous[0].wikiRefs[0].target, '');
});

test('graph and API projection hide private endpoints and preserve hidden relations on editor saves', () => {
  const data = fixture();
  const graph = workspaceGraph(data, { role: 'editor' });
  assert.ok(!graph.nodes.some(node => node.id === 'hidden'));
  assert.ok(!graph.edges.some(edge => edge.id === 'r'));
  const visible = projectWorkspace(data, { id: 'editor', role: 'editor' });
  assert.deepEqual(visible.relations, []);
  assert.equal(mergeClientWorkspace(data, visible, 'editor', 'editor').relations.length, 1);
  visible.relations.push({ id: 'forged', from: 'note:a', to: 'task:hidden', type: 'source' });
  assert.throws(() => mergeClientWorkspace(data, visible, 'editor', 'editor'), { code: 'ENTITY_FORBIDDEN' });
});

test('trash hides dangling links until the same ID is restored; tombstones merge with concurrent additions', () => {
  const data = fixture();
  data.relations = [{ id: 'r', from: 'note:a', to: 'bookmark:l', type: 'source' }];
  data.links = [];
  assert.ok(!workspaceGraph(data, { role: 'admin' }).edges.some(edge => edge.id === 'r'));
  data.links = [{ id: 'l' }];
  assert.ok(workspaceGraph(data, { role: 'admin' }).edges.some(edge => edge.id === 'r'));
  const local = structuredClone(data),
    remote = structuredClone(data);
  local.relations[0].deletedAt = '2026-10-18T00:00:00Z';
  remote.relations.push({ id: 'other', from: 'note:b', to: 'bookmark:l', type: 'related' });
  const merged = mergeWorkspaceData(data, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.relations.length, 2);
  assert.ok(merged.data.relations[0].deletedAt);
  const graph = graphNeighborhood(workspaceGraph(data, { role: 'admin' }), 'bookmark:l', 1);
  assert.deepEqual(graph.nodes.map(node => node.key).sort(), ['bookmark:l', 'note:a']);
});

test('portable v2 remaps relation endpoints and wiki bindings across collisions and bookmark duplicates without mutating input', () => {
  const current = {
    knowledgeNotes: [{ id: 'a', title: 'Existing', formatted_markdown: 'old' }],
    links: [{ id: 'existing-link', url: 'https://example.com/' }],
    knowledgeFolders: [],
    linkFolders: [],
  };
  const original = structuredClone(current);
  const payload = {
    format: 'smena-manager-portable',
    version: 2,
    notes: [
      { id: 'a', title: 'New', formatted_markdown: '[[Second]]', wikiRefs: [{ label: 'Second', target: 'b' }] },
      { id: 'b', title: 'Second', formatted_markdown: 'body' },
    ],
    links: [{ id: 'x', url: 'https://example.com/' }],
    relations: [{ id: 'r', from: 'note:a', to: 'bookmark:x', type: 'source' }],
  };
  let seq = 0;
  const imported = mergePortableWorkspace(current, payload, { idFactory: prefix => `${prefix}-${++seq}` });
  const note = imported.data.knowledgeNotes.find(item => item.formatted_markdown === '[[Second]]');
  assert.notEqual(note.id, 'a');
  assert.equal(note.wikiRefs[0].target, 'b');
  assert.equal(imported.data.relations[0].from, `note:${note.id}`);
  assert.equal(imported.data.relations[0].to, 'bookmark:existing-link');
  assert.deepEqual(current, original);
  const restored = mergePortableWorkspace({ knowledgeNotes: [], links: [], knowledgeFolders: [], linkFolders: [] }, buildPortableWorkspace(imported.data));
  assert.equal(restored.data.relations.length, 1);
});

test('core API snapshots keep globally-readable note edges, and malformed edges fail validation', () => {
  const data = fixture();
  data.relations = [{ id: 'r', from: 'note:a', to: 'bookmark:l', type: 'source' }];
  const core = structuredClone(data);
  delete core.knowledgeNotes;
  delete core.links;
  assert.equal(projectWorkspace(core, { id: 'editor', role: 'editor' }).relations.length, 1);
  const bad = createEmptyDatabase();
  bad.relations = [{ id: 'r', from: 'note:a', to: 'javascript:evil', type: 'source' }];
  assert.throws(() => validateWorkspaceData(bad), { code: 'WORKSPACE_INVALID' });
});

test('graph builds bounded views over ten thousand tasks within the regression budget', () => {
  const data = { me: 'm', projects: [{ id: 'p' }], tasks: Array.from({ length: 10000 }, (_, i) => ({ id: String(i), project: 'p' })) };
  const start = performance.now();
  const graph = workspaceGraph(data, { role: 'editor' });
  assert.equal(graph.nodes.length, 10001);
  assert.equal(graph.edges.length, 10000);
  assert.ok(performance.now() - start < 2000);
});
