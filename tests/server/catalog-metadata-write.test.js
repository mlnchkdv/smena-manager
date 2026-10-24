import test from 'node:test';
import assert from 'node:assert/strict';
import { writeCatalogShards, materializeCatalog } from '../../src/server/storage/file-catalog-shards.js';
import { metadataWriteBase, patchCatalogMetadata } from '../../src/server/storage/catalog-metadata-write.js';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { applyPersonalSettings } from '../../src/shared/personal-settings.js';
import { createCatalogAccounting } from '../../src/server/file-catalog-accounting.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { rememberStorageVersion, storageVersion } from '../../src/server/storage/version-token.js';
import { FILE_CATALOG_MAX_BYTES } from '../../src/shared/file-catalog.js';

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

test('metadata snapshots enforce canonical file identity and active-folder references from manifest keys', async () => {
  const f = await fixture();
  f.root.projects = [{ id: 'p', fileFolders: [{ id: 'folder', name: 'Folder' }] }];
  f.root._fileCatalog.shards[0].keys[0][1] = 'folder';
  assert.ok(metadataWriteBase(f.root));
  for (const change of [
    root => (root.projects[0].fileFolders[0].archived = true),
    root => (root._fileCatalog.shards[0].keys[0][1] = 'missing'),
    root => (root._fileCatalog.shards[0].keys[0][0] = 'invalid file id'),
  ]) {
    const invalid = structuredClone(f.root);
    change(invalid);
    assert.throws(() => metadataWriteBase(invalid), { statusCode: 503, code: 'FILE_CATALOG_CORRUPT' });
  }
});

test('Drive metadata publication reads only the root, uses its bound ETag and cannot publish a forged snapshot', async () => {
  const f = await fixture();
  const provider = new GoogleDriveStorageProvider();
  provider.databaseFileId = 'db';
  let reads = 0,
    writes = 0,
    published;
  provider.readDatabaseRoot = async () => {
    reads++;
    return rememberStorageVersion(structuredClone(f.root), '"root-9"');
  };
  provider.readCatalogPart = () => assert.fail('Metadata-only writes must not download file parts');
  provider.updateVersionedJson = async (request, options) => {
    assert.equal(options.headers['If-Match'], '"root-9"');
    assert.equal(request.fileId, 'db');
    let body = '';
    for await (const chunk of request.media.body) body += chunk;
    published = JSON.parse(body);
    writes++;
    return { headers: { etag: '"root-10"' } };
  };
  const baseline = await provider.loadDatabaseMetadata();
  provider.databaseEtag = '"unrelated-cursor"';
  provider.catalogRoot = { revision: 123 };
  const next = applyPersonalSettings(nextRevision(baseline), 'me', { preferences: { lang: 'Русский' } });
  await assert.rejects(provider.saveDatabaseMetadata(next, structuredClone(baseline), { scope: 'preferences', memberId: 'me' }), {
    code: 'STORAGE_VERSION_MISSING',
  });
  await provider.saveDatabaseMetadata(next, baseline, { scope: 'preferences', memberId: 'me' });
  assert.deepEqual({ reads, writes }, { reads: 1, writes: 1 });
  assert.deepEqual(published._fileCatalog.shards, f.root._fileCatalog.shards);
  assert.equal(Object.hasOwn(published, 'files'), false);
  assert.equal(storageVersion(next), '"root-10"');
  await assert.rejects(provider.saveDatabaseMetadata(next, baseline, { scope: 'preferences', memberId: 'me' }), { code: 'STORAGE_VERSION_MISSING' });
});

test('Drive propagates CAS failures without replacing the current root or exposing partial data', async () => {
  const f = await fixture();
  const provider = new GoogleDriveStorageProvider();
  provider.databaseFileId = 'db';
  provider.readDatabaseRoot = async () => rememberStorageVersion(structuredClone(f.root), '"old"');
  const baseline = await provider.loadDatabaseMetadata();
  const newer = { revision: 11 };
  provider.catalogRoot = newer;
  provider.updateVersionedJson = async () => {
    throw Object.assign(new Error('Precondition failed'), { code: 412 });
  };
  await assert.rejects(provider.saveDatabaseMetadata(nextRevision(baseline), baseline, { scope: 'preferences', memberId: 'me' }), { code: 412 });
  assert.equal(provider.catalogRoot, newer);
  assert.equal(storageVersion(baseline), '"old"');
});

test('revision digit growth cannot exceed the catalog limit and missing ETags cannot authorize a metadata write', async () => {
  const f = await fixture(9);
  f.root._fileCatalog.accounting.catalogBytes = FILE_CATALOG_MAX_BYTES;
  assert.throws(() => patchCatalogMetadata(f.root, f.base, nextRevision(f.base), 'preferences', 'me'), {
    code: 'WORKSPACE_TOO_LARGE',
    statusCode: 413,
    actualBytes: FILE_CATALOG_MAX_BYTES + 1,
  });
  const provider = new GoogleDriveStorageProvider();
  provider.databaseFileId = 'db';
  provider.readDatabaseRoot = async () => structuredClone(f.root);
  provider.updateVersionedJson = () => assert.fail('No write without the snapshot ETag');
  const baseline = await provider.loadDatabaseMetadata();
  await assert.rejects(provider.saveDatabaseMetadata(nextRevision(baseline), baseline, { scope: 'preferences', memberId: 'me' }), {
    code: 'STORAGE_VERSION_MISSING',
  });
});
