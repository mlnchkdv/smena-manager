import test from 'node:test';
import assert from 'node:assert/strict';
import { queryGraph } from '../../src/server/graph-query.js';
import { mergeClientWorkspace, projectWorkspace } from '../../src/server/workspace-policy.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { indexKnowledgeBodyLinks } from '../../src/shared/knowledge-body-links.js';
import { buildPortableWorkspace, mergePortableWorkspace } from '../../src/shared/portable-workspace.js';

const options = { revision: 0, documents: { knowledge: 0, bookmarks: 0 }, mode: 'view', center: 'task:t', summary: true, includeArchived: true };
const actor = { id: 'm', role: 'editor' };
function fixture() {
  return {
    ...createEmptyDatabase(),
    members: [{ id: 'm', name: 'Editor / Участник', role: 'Member' }],
    me: 'm',
    projects: [
      { id: 'p', name: 'Project' },
      { id: 'secret', name: 'Private', private: true, members: ['other'] },
    ],
    projOrder: ['p', 'secret'],
    tasks: [
      { id: 't', project: 'p', title: 'Task' },
      { id: 'private-task', project: 'secret' },
    ],
    knowledgeNotes: [{ id: 'n', title: 'Decision', createdBy: 'm', formatted_markdown: '[[task:t]]' }],
    files: Array.from({ length: 301 }, (_, i) => ({ id: 'f' + i, name: 'File ' + i, project: i === 300 ? 'secret' : 'p', task: 't' })),
    relations: [
      { id: 'decision', from: 'note:n', to: 'task:t', type: 'decision' },
      { id: 'source', from: 'note:n', to: 'task:t', type: 'source' },
      { id: 'hidden', from: 'task:t', to: 'task:private-task', type: 'decision' },
    ],
  };
}

test('rollup counts ACL-filtered direct unique materials before the 250-node view cap, preserving type/origin overlap', () => {
  const data = fixture(),
    view = queryGraph(data, actor, options),
    rollup = view.rollup;
  assert.equal(view.nodes.length, 250);
  assert.equal(view.truncated, true);
  assert.equal(rollup.total, 302, '300 visible files, one note, one project');
  assert.deepEqual(rollup.kinds, [
    { key: 'file', count: 300 },
    { key: 'note', count: 1 },
    { key: 'project', count: 1 },
  ]);
  assert.equal(rollup.types.find(row => row.key === 'decision').count, 1, 'Private decision not counted');
  assert.equal(rollup.types.find(row => row.key === 'source').count, 1, 'Two source edges to the same note count once');
  assert.equal(rollup.origins.find(row => row.key === 'manual').count, 1);
  assert.equal(rollup.origins.find(row => row.key === 'wiki').count, 1);
  assert.equal(rollup.coverage.complete, true);
  assert.equal(JSON.stringify(view).includes('private-task'), false);
  assert.equal(queryGraph(data, actor, { ...options, center: 'task:private-task' }).rollup, null);
  assert.throws(() => queryGraph(data, actor, { ...options, summary: 'yes' }), TypeError);
  const note = queryGraph(data, actor, { ...options, center: 'note:n' }).rollup;
  assert.equal(note.author.name, 'Editor / Участник');
  data.members[0].status = 'deactivated';
  assert.throws(() => queryGraph(data, actor, options), { code: 'AUTH_REQUIRED' });
});

test('rollup explicitly marks unindexed, stale or capped cold text instead of claiming a complete zero', () => {
  const data = fixture(),
    sha256 = 'a'.repeat(64),
    note = data.knowledgeNotes[0];
  delete note.formatted_markdown;
  note.bodyRef = { kind: 'knowledge-body-v1', sha256, bytes: 100 };
  assert.deepEqual(queryGraph(data, actor, options).rollup.coverage, { complete: false, unindexedNotes: 1 });
  note.bodyLinks = indexKnowledgeBodyLinks('[[task:t]]', sha256);
  assert.equal(queryGraph(data, actor, options).rollup.coverage.complete, true);
  note.bodyLinks.complete = false;
  assert.equal(queryGraph(data, actor, options).rollup.coverage.complete, false);
  note.bodyLinks = { ...note.bodyLinks, complete: true, sha256: 'b'.repeat(64) };
  assert.equal(queryGraph(data, actor, options).rollup.coverage.complete, false);
});

test('manual connection provenance is stamped by the server, immutable creation fields survive later edits', () => {
  const data = fixture();
  data.files = [];
  data.relations = [];
  const input = projectWorkspace(data, actor);
  input.relations = [
    {
      id: 'r',
      from: 'note:n',
      to: 'task:t',
      type: 'decision',
      createdBy: 'forged',
      createdAt: '2000-01-01T00:00:00Z',
      recordedBy: 'forged',
      recordedAt: '2000-01-01T00:00:00Z',
    },
  ];
  const saved = mergeClientWorkspace(data, input, 'editor', 'm'),
    edge = saved.relations[0];
  assert.equal(edge.createdBy, 'm');
  assert.equal(edge.recordedBy, 'm');
  assert.notEqual(edge.createdAt, '2000-01-01T00:00:00Z');
  assert.equal(edge.recordedAt, edge.createdAt);
  const edit = projectWorkspace(saved, actor);
  edit.relations[0] = { ...edge, type: 'source', createdBy: 'forged', createdAt: '2000-01-01T00:00:00Z', recordedBy: 'forged' };
  const updated = mergeClientWorkspace(saved, edit, 'editor', 'm').relations[0];
  assert.equal(updated.createdBy, 'm');
  assert.equal(updated.createdAt, edge.createdAt);
  assert.equal(updated.recordedBy, 'm');
  const noChange = mergeClientWorkspace(saved, projectWorkspace(saved, actor), 'editor', 'm');
  assert.deepEqual(noChange.relations[0], edge, 'Unchanged rows do not advance their audit timestamp');
  assert.throws(() => mergeClientWorkspace(data, input, 'viewer', 'm'), { code: 'ENTITY_FORBIDDEN' });
});

test('decision relationships round-trip through the portable library without claiming a foreign server audit', () => {
  const source = {
    knowledgeNotes: [
      { id: 'a', title: 'Decision', formatted_markdown: 'Text' },
      { id: 'b', title: 'Context', formatted_markdown: 'Context body' },
    ],
    knowledgeFolders: [],
    links: [],
    linkFolders: [],
    relations: [{ id: 'r', from: 'note:a', to: 'note:b', type: 'decision', recordedBy: 'foreign', recordedAt: new Date().toISOString() }],
  };
  const restored = mergePortableWorkspace({ knowledgeNotes: [], knowledgeFolders: [], links: [], linkFolders: [] }, buildPortableWorkspace(source));
  assert.equal(restored.data.relations.length, 1);
  assert.equal(restored.data.relations[0].type, 'decision');
  assert.equal(restored.data.relations[0].recordedBy, undefined);
});
