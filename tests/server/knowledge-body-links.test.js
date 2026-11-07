import test from 'node:test';
import assert from 'node:assert/strict';
import { indexKnowledgeBodyLinks, validKnowledgeBodyLinks, coldKnowledgeBodyLinks, KNOWLEDGE_BODY_LINK_LIMIT } from '../../src/shared/knowledge-body-links.js';
import { storeKnowledgeBody, loadKnowledgeBody, stageKnowledgeBodyWindow } from '../../src/server/knowledge-body-store.js';
import { workspaceGraph } from '../../src/shared/relations.js';
import { knowledgeCatalogNote } from '../../src/server/knowledge-catalog.js';

test('cold graph preserves exact material/media edges without reading bodies, and keeps ACL filtering', async () => {
  const objects = new Map();
  const storage = { writeKnowledgeBody: async (text, hash) => objects.set(hash, text), readKnowledgeBody: async hash => objects.get(hash) };
  const note = {
    id: 'n',
    title: 'Source / Источник',
    assets: { 'image.png': 'f' },
    formatted_markdown: '![](smena-file:f) [[file:f|File]] [[task:t|Task]] [[project:private|Hidden]]',
  };
  const stored = await storeKnowledgeBody(storage, note);
  assert.equal(validKnowledgeBodyLinks(stored), true);
  assert.equal(validKnowledgeBodyLinks(knowledgeCatalogNote(stored)), true);
  const data = {
    me: 'm',
    projects: [{ id: 'p' }, { id: 'private', private: true, members: ['other'] }],
    tasks: [{ id: 't', project: 'p' }],
    files: [{ id: 'f', project: 'p' }],
  };
  const warm = workspaceGraph({ ...data, knowledgeNotes: [note] }, { role: 'editor' });
  const cold = workspaceGraph({ ...data, knowledgeNotes: [stored] }, { role: 'editor' });
  assert.deepEqual(cold.edges, warm.edges);
  assert.equal(
    cold.edges.some(edge => edge.to === 'project:private'),
    false,
  );
  assert.equal(cold.edges.filter(edge => edge.to === 'file:f' && edge.from === 'note:n').length, 2);
  assert.deepEqual(await loadKnowledgeBody(storage, stored), note, 'Derived index is not part of source/history/export');
  const legacy = { ...stored };
  delete legacy.bodyLinks;
  const migrated = await stageKnowledgeBodyWindow({ knowledgeNotes: [legacy] }, storage, ['n']);
  assert.equal(validKnowledgeBodyLinks(migrated.knowledgeNotes[0]), true);
  assert.equal(legacy.bodyLinks, undefined, 'Explicit staging never mutates the published source');
});

test('derived link index is bounded, deduplicated, hash-bound and rejects malformed or stale records', () => {
  const sha256 = 'a'.repeat(64);
  const repeated = indexKnowledgeBodyLinks('[[task:t]] [[task:t|Alias]] [[ordinary wiki]]', sha256);
  assert.deepEqual(repeated.refs, [{ key: 'task:t', syntax: 'inline' }]);
  assert.equal(repeated.complete, true);
  const dense = indexKnowledgeBodyLinks(Array.from({ length: KNOWLEDGE_BODY_LINK_LIMIT + 1 }, (_, i) => `[[task:t${i}]]`).join(' '), sha256);
  assert.equal(dense.refs.length, KNOWLEDGE_BODY_LINK_LIMIT);
  assert.equal(dense.complete, false);
  const note = { bodyRef: { sha256 }, bodyLinks: repeated };
  for (const bodyLinks of [
    { ...repeated, sha256: 'b'.repeat(64) },
    { ...repeated, refs: [...repeated.refs, ...repeated.refs] },
    { ...repeated, refs: [{ key: 'task:t', syntax: 'media' }] },
    { ...repeated, refs: [{ key: 'javascript:alert', syntax: 'inline' }] },
    { ...repeated, complete: 'yes' },
  ]) {
    assert.equal(validKnowledgeBodyLinks({ ...note, bodyLinks }), false);
    assert.deepEqual(coldKnowledgeBodyLinks({ ...note, bodyLinks }), []);
  }
});
