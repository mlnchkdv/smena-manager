import test from 'node:test';
import assert from 'node:assert/strict';
import { writeCatalogShards, materializeCatalog } from '../../src/server/storage/file-catalog-shards.js';
import { metadataWriteBase, patchCatalogMetadata } from '../../src/server/storage/catalog-metadata-write.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
import { createCatalogAccounting } from '../../src/server/file-catalog-accounting.js';

async function fixture(revision = 9) {
  const data = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    revision,
    members: [{ id: 'me', role: 'Owner' }, { id: 'other' }],
    files: [{ id: 'f', project: 'p', name: 'Инструкция.md', bytes: null, history: ['private'.repeat(5000)] }],
    _documentRevisions: { knowledge: { revision: 2 }, bookmarks: { revision: 3 } },
    notifs: [
      { id: 'mine', recipient: 'me', read: false },
      { id: 'theirs', recipient: 'other', read: false },
    ],
  };
  const parts = new Map();
  const root = await writeCatalogShards(data, null, async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  });
  const base = metadataWriteBase(root);
  return { root, base, data, parts };
}
const nextRevision = base => ({ ...structuredClone(base), revision: base.revision + 1, updatedAt: new Date().toISOString() });

test('root-only preferences preserve complete immutable records and exact accounting across revision digit growth', async () => {
  for (const revision of [9, 99, 100]) {
    const f = await fixture(revision);
    const next = applyPersonalSettings(nextRevision(f.base), 'me', { preferences: { lang: 'English (US)' }, profile: { name: 'Updated' } });
    const root = patchCatalogMetadata(f.root, f.base, next, 'preferences', 'me');
    assert.deepEqual(root._fileCatalog.shards, f.root._fileCatalog.shards);
    const full = await materializeCatalog(root, async id => f.parts.get(id));
    assert.deepEqual(full.files, f.data.files);
    assert.deepEqual(root._fileCatalog.accounting, createCatalogAccounting(full));
    assert.equal(full.members[0].name, 'Updated');
    assert.equal(f.base.files.length, 0);
  }
});

test('document patches preserve sibling revisions and reject all file/ACL/retention side effects', async () => {
  const f = await fixture();
  const next = nextRevision(f.base);
  next.knowledgeNotes = [{ id: 'note', title: 'Guide' }];
  next._documentRevisions.knowledge = { revision: 3, createdAt: f.base.createdAt, updatedAt: next.updatedAt };
  assert.equal(patchCatalogMetadata(f.root, f.base, next, 'knowledge').knowledgeNotes[0].title, 'Guide');
  for (const field of ['files', 'projects', 'tasks', 'relations', '_fileGc', '_fileRegistry', 'trash', 'members']) {
    assert.throws(() => patchCatalogMetadata(f.root, f.base, { ...next, [field]: [{ id: 'forged' }] }, 'knowledge'), { code: 'METADATA_WRITE_FORBIDDEN' });
  }
  const sibling = structuredClone(next);
  sibling._documentRevisions.bookmarks.revision++;
  assert.throws(() => patchCatalogMetadata(f.root, f.base, sibling, 'knowledge'), { code: 'METADATA_WRITE_FORBIDDEN' });
});

test('personal patches cannot elevate roles, change other profiles or edit another recipient', async () => {
  const f = await fixture();
  for (const change of [
    n => (n.members[0].role = 'admin'),
    n => (n.members[1].name = 'Other'),
    n => (n._userPrefs = { other: { lang: 'English (US)' } }),
    n => (n.notifs[1].read = true),
  ]) {
    const next = nextRevision(f.base);
    change(next);
    assert.throws(() => patchCatalogMetadata(f.root, f.base, next, 'preferences', 'me'), { code: 'METADATA_WRITE_FORBIDDEN' });
  }
  assert.throws(() => patchCatalogMetadata(f.root, f.base, nextRevision(f.base), 'preferences', 'unknown'), { code: 'METADATA_WRITE_FORBIDDEN' });
});

test('legacy roots opt out, while corrupt manifests/accounting fail closed', async () => {
  const f = await fixture();
  assert.equal(metadataWriteBase({ ...f.root, schemaVersion: 2 }), null);
  const old = structuredClone(f.root);
  delete old._fileCatalog.accounting;
  assert.equal(metadataWriteBase(old), null);
  for (const change of [r => r._fileCatalog.total++, r => r._fileCatalog.accounting.revision++, r => (r.files = [])]) {
    const bad = structuredClone(f.root);
    change(bad);
    assert.throws(() => metadataWriteBase(bad), { code: 'FILE_CATALOG_CORRUPT' });
  }
});
