import test from 'node:test';
import assert from 'node:assert/strict';
import { queryGraph } from '../../src/server/graph-query.js';

const user = { id: 'm', role: 'editor' };
const options = { revision: 7, documents: { knowledge: 3, bookmarks: 1 } };
const fixture = () => ({
  revision: 7,
  _documentRevisions: { knowledge: { revision: 3 }, bookmarks: { revision: 1 } },
  members: [{ id: 'm' }],
  projects: [
    { id: 'p', name: 'Public' },
    { id: 'secret', private: true, members: ['other'] },
  ],
  tasks: [{ id: 't', project: 'p' }],
  files: Array.from({ length: 10000 }, (_, i) => ({
    id: `f${i}`,
    name: `Файл ${i}`,
    project: i < 9000 ? 'p' : 'secret',
    storageFileId: 'private-storage',
    versions: ['heavy'],
    tags: ['документ'],
  })),
  knowledgeNotes: [
    { id: 'n', title: 'Регламент', formatted_markdown: '[[Second]]', history: ['private-history'] },
    { id: 'n2', title: 'Second' },
  ],
  links: [],
  relations: [{ id: 'r', from: 'note:n', to: 'file:f8999', type: 'source' }],
});

test('graph query searches all 10k rows but returns at most 250 safe nodes with exact ACL-filtered totals', () => {
  const data = fixture();
  const view = queryGraph(data, user, options);
  assert.equal(view.nodes.length, 250);
  assert.equal(view.total, 9004);
  assert.equal(view.truncated, true);
  const search = queryGraph(data, user, { ...options, query: 'файл 8999', kind: 'file' });
  assert.deepEqual(
    search.nodes.map(node => node.id),
    ['f8999'],
  );
  assert.equal(search.nodes[0].item.versions, undefined);
  assert.equal(JSON.stringify(search).includes('private-storage'), false);
  assert.equal(queryGraph(data, user, { ...options, project: 'secret' }).total, 0);
  assert.equal(JSON.stringify(view).includes('private-history'), false);
  const local = queryGraph(data, user, { ...options, center: 'note:n', depth: 1 });
  assert.deepEqual(
    local.nodes.map(node => node.key),
    ['note:n', 'note:n2', 'file:f8999'],
  );
  const exported = queryGraph(data, user, { ...options, mode: 'export' });
  assert.equal(exported.nodes.length, 9004);
  assert.equal(
    exported.edges.some(edge => edge.id === 'r'),
    true,
    'Export preserves cross-window connections',
  );
});

test('connection candidates are bounded, writable, searchable, source-excluding and wiki-aware', () => {
  const data = fixture();
  const candidates = queryGraph(data, user, { ...options, mode: 'candidates', source: 'note:n' });
  assert.equal(candidates.nodes.length, 50);
  assert.equal(candidates.total, 9003);
  assert.equal(candidates.truncated, true);
  const match = queryGraph(data, user, { ...options, mode: 'candidates', source: 'note:n', kind: 'file', query: 'Файл 8999' });
  assert.deepEqual(
    match.nodes.map(node => node.key),
    ['file:f8999'],
  );
  const wiki = queryGraph(data, user, { ...options, mode: 'candidates', source: 'note:n', wikiOnly: true });
  assert.deepEqual(
    wiki.nodes.map(node => node.key),
    ['note:n2'],
  );
  assert.throws(() => queryGraph(data, { ...user, role: 'viewer' }, { ...options, mode: 'candidates', source: 'note:n' }), { statusCode: 403 });
  assert.throws(() => queryGraph(data, user, { ...options, mode: 'candidates', source: 'file:f9999' }), { statusCode: 403 });
});

test('graph reads fence core/document revisions and recheck membership before exposing results', () => {
  const data = fixture();
  for (const invalid of [{ revision: 6 }, { documents: { knowledge: 2, bookmarks: 1 } }])
    assert.throws(() => queryGraph(data, user, { ...options, ...invalid }), { code: 'REVISION_CONFLICT' });
  for (const invalid of [{ depth: 3 }, { mode: 'full' }, { query: 'x'.repeat(501) }, { includeArchived: 'yes' }, { revision: '7' }])
    assert.throws(() => queryGraph(data, user, { ...options, ...invalid }), TypeError);
  data.members[0].role = 'Member';
  assert.equal(queryGraph(data, { ...user, role: 'admin' }, { ...options, project: 'secret' }).total, 0);
  data.members[0].status = 'deactivated';
  assert.throws(() => queryGraph(data, user, options), { statusCode: 401 });
});
