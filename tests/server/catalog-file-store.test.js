import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';
import { getStorageProvider, resetStorageProvider } from '../../src/server/storage/index.js';
import {
  createEmptyDatabase,
  getWorkspaceDatabase,
  tryMutateWorkspaceFiles,
  resetWorkspaceStore,
  mutateWorkspaceCatalogCommand,
  getWorkspaceUploadSnapshot,
} from '../../src/server/workspace-store.js';
import { tryMutateWorkspaceFileRemoval } from '../../src/server/file-removal-patch.js';
import { registerFileMetadata } from '../../src/server/file-registry.js';
import { retainDetachedFile } from '../../src/server/file-retention.js';
import { writeCatalogShards, materializeCatalog, catalogCore } from '../../src/server/storage/file-catalog-shards.js';
import { rememberStorageVersion } from '../../src/server/storage/version-token.js';
import { workspaceCoreData } from '../../src/shared/workspace-documents.js';
import { projectWorkspace } from '../../src/server/workspace-policy.js';
import { createCatalogAccounting } from '../../src/server/file-catalog-accounting.js';

async function fixture(t) {
  const keys = ['VERCEL', 'WORKSPACE_WRITE_MODE', 'REDIS_URL'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  delete process.env.VERCEL;
  resetStorageProvider();
  resetWorkspaceStore();
  const storage = getStorageProvider();
  let raw = {
    ...createEmptyDatabase(),
    _aggregateVersion: 1,
    revision: 9,
    me: 'me',
    members: [
      { id: 'me', role: 'Member' },
      { id: 'owner', role: 'Owner' },
    ],
    projects: [
      { id: 'p', name: 'Public', key: 'PRJ', seq: 1, fileFolders: [{ id: 'folder', name: 'Папка' }] },
      { id: 'private', name: 'Private', key: 'PRIVATE', seq: 0, access: 'private', members: ['owner'] },
    ],
    files: [
      { id: 'f', name: 'Guide.txt', project: 'p', storageName: 'guide', storageFileId: 'physical', bytes: 12, history: ['canonical'] },
      { id: 'hidden', project: 'private', name: 'Private.txt', history: ['private'] },
    ],
    tasks: [
      {
        id: 't',
        key: 'PRJ-1',
        project: 'p',
        title: 'Task',
        attachments: [{ id: 'f', name: 'Guide.txt', project: 'p', storageName: 'guide', storageFileId: 'physical', bytes: 12 }],
      },
    ],
    relations: [{ id: 'r', from: 'file:f', to: 'project:p', type: 'related' }],
  };
  storage.init = async () => {};
  storage.loadDatabase = async () => raw;
  raw = await getWorkspaceDatabase();
  resetWorkspaceStore();
  const parts = new Map();
  const write = async text => {
    const id = `part-${parts.size}`;
    parts.set(id, text);
    return id;
  };
  let root = await writeCatalogShards(raw, null, write);
  const counts = { root: 0, part: 0, full: 0, writes: 0, uploads: 0 };
  const drive = new GoogleDriveStorageProvider();
  drive.databaseFileId = 'db';
  drive.readDatabaseRoot = async () => {
    counts.root++;
    return rememberStorageVersion(structuredClone(root), `v${root.revision}`);
  };
  drive.readCatalogPart = async id => {
    counts.part++;
    return parts.get(id);
  };
  drive.client = {
    files: {
      create: async request => {
        let text = '';
        for await (const chunk of request.media.body) text += chunk;
        counts.uploads++;
        return { data: { id: await write(text) } };
      },
    },
  };
  let race;
  drive.updateVersionedJson = async (request, options) => {
    if (race) {
      race(root);
      race = null;
    }
    if (options.headers['If-Match'] !== `v${root.revision}`) throw Object.assign(new Error('Conflict'), { code: 412 });
    let text = '';
    for await (const chunk of request.media.body) text += chunk;
    root = JSON.parse(text);
    counts.writes++;
    return { headers: { etag: `v${root.revision}` } };
  };
  storage.loadDatabaseFilePatch = drive.loadDatabaseFilePatch.bind(drive);
  storage.saveDatabaseFilePatch = drive.saveDatabaseFilePatch.bind(drive);
  storage.saveDatabaseFileDelta = drive.saveDatabaseFileDelta.bind(drive);
  storage.loadDatabaseUploadState = drive.loadDatabaseUploadState.bind(drive);
  storage.saveDatabase = async (next, options) => {
    assert.equal(options.expectedEtag, `v${root.revision}`);
    root = await writeCatalogShards(next, root._fileCatalog, write);
    counts.writes++;
  };
  storage.loadDatabaseCore = async ({ identities }) => catalogCore(root, { identities });
  storage.loadDatabase = async () => {
    counts.full++;
    return rememberStorageVersion(await materializeCatalog(root, async id => parts.get(id)), `v${root.revision}`);
  };
  process.env.VERCEL = '1';
  process.env.WORKSPACE_WRITE_MODE = 'drive';
  delete process.env.REDIS_URL;
  t.after(() => {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    resetStorageProvider();
    resetWorkspaceStore();
  });
  const user = { id: 'me', role: 'editor' };
  const payload = () => {
    const { files, schemaVersion, revision, createdAt, updatedAt, workspace, ...incoming } = workspaceCoreData(projectWorkspace(catalogCore(root), user));
    void files;
    void schemaVersion;
    void revision;
    void createdAt;
    void updatedAt;
    void workspace;
    return incoming;
  };
  return {
    storage,
    drive,
    counts,
    raw,
    root: () => root,
    payload,
    user,
    parts,
    full: () => materializeCatalog(root, async id => parts.get(id)),
    race: callback => (race = callback),
  };
}

test('rename and folder moves use only selected parts, retain hidden rows/registry/relations and invalidate the complete cache', async t => {
  const f = await fixture(t);
  const first = { ...f.raw.files[0], name: 'Новое имя.md' };
  const result = await tryMutateWorkspaceFiles(f.payload(), { upsert: [first], remove: [] }, 9, f.user);
  assert.ok(result);
  assert.equal(result.revision, 10);
  assert.equal(result.files.length, 2);
  assert.equal(result.relations[0].id, 'r');
  assert.equal(f.counts.full, 0);
  assert.equal(f.counts.part, 1);
  assert.equal(f.counts.writes, 1);
  const incoming = f.payload();
  incoming.tasks[0].attachments[0].folderId = 'folder';
  assert.ok(await tryMutateWorkspaceFiles(incoming, { upsert: [{ ...first, folderId: 'folder' }], remove: [] }, 10, f.user));
  const full = await getWorkspaceDatabase();
  assert.equal(f.counts.full, 1);
  assert.equal(full.files[0].name, 'Новое имя.md');
  assert.equal(full.tasks[0].attachments[0].folderId, 'folder');
  assert.deepEqual(full.files[1], f.raw.files[1]);
  assert.deepEqual(full._fileRegistry, f.raw._fileRegistry);
  assert.deepEqual(f.root()._fileCatalog.accounting, createCatalogAccounting(full));
});

test('latest role and project ACL reject writes before reading private parts; stale revisions never stage', async t => {
  const f = await fixture(t);
  const changes = { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] };
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), changes, 8, f.user), { code: 'REVISION_CONFLICT' });
  f.root().members[0].role = 'Guest';
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), changes, 9, { ...f.user, role: 'admin' }), { code: 'ENTITY_FORBIDDEN' });
  f.root().members[0].role = 'Member';
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[1], name: 'Private' }], remove: [] }, 9, f.user), {
    code: 'ENTITY_FORBIDDEN',
  });
  assert.equal(f.counts.part, 0);
  assert.equal(f.counts.uploads, 0);
  assert.equal(f.counts.writes, 0);
});

test('mixed core changes, additions, removals and physical changes fall back without partial publication', async t => {
  const f = await fixture(t);
  const changes = { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] };
  const incoming = f.payload();
  incoming.tasks[0].title = 'Other change';
  assert.equal(await tryMutateWorkspaceFiles(incoming, changes, 9, f.user), null);
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [{ id: 'new', name: 'new', project: 'p' }], remove: [] }, 9, f.user), null);
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [], remove: ['f'] }, 9, f.user), null);
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], storageName: 'forged' }], remove: [] }, 9, f.user), null);
  assert.equal(f.counts.writes, 0);
  assert.equal(f.counts.full, 0);
});

test('task-key/sequence migration leaves the scoped path before reading or staging catalog parts', async t => {
  const f = await fixture(t);
  delete f.root().tasks[0].key;
  assert.equal(await tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] }, 9, f.user), null);
  assert.equal(f.counts.part, 0);
  assert.equal(f.counts.uploads, 0);
  assert.equal(f.counts.writes, 0);
});

test('CAS loss never overwrites a concurrent root and forged snapshot objects are rejected', async t => {
  const f = await fixture(t);
  f.race(root => {
    root.revision++;
    root.projects[0].name = 'Concurrent';
  });
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] }, 9, f.user), {
    code: 'REVISION_CONFLICT',
  });
  assert.equal(f.root().projects[0].name, 'Concurrent');
  assert.equal(f.counts.writes, 0);
  await assert.rejects(f.drive.saveDatabaseFilePatch({ data: f.raw, files: f.raw.files }, f.raw.files, f.raw.tasks, 10, new Date().toISOString()), {
    code: 'STORAGE_VERSION_MISSING',
  });
});

test('corrupt selected parts fail closed without staging uploads', async t => {
  const f = await fixture(t);
  const part = f.root()._fileCatalog.shards.find(part => part.project === 'p');
  f.parts.set(part.id, '[]');
  await assert.rejects(tryMutateWorkspaceFiles(f.payload(), { upsert: [{ ...f.raw.files[0], name: 'Renamed' }], remove: [] }, 9, f.user), {
    code: 'FILE_CATALOG_CORRUPT',
  });
  assert.equal(f.counts.uploads, 0);
  assert.equal(f.counts.writes, 0);
});

function uploadCommand(file) {
  return data => {
    data.files.unshift(file);
    registerFileMetadata(data, file, true);
    data._pendingUploads = (data._pendingUploads || []).filter(item => item.filename !== file.storageName);
    if (file.task) data.tasks.find(task => task.id === file.task).attachments.push(file);
    return data;
  };
}

test('verified upload commands and recoverable deletion touch only selected parts and retain exact accounting', async t => {
  const f = await fixture(t);
  const file = {
    id: 'new-upload',
    name: 'Новый.txt',
    project: 'p',
    task: 't',
    storageFileId: 'new-physical',
    storageName: 'new.txt',
    bytes: 19,
    by: 'me',
    ownerId: 'me',
  };
  await mutateWorkspaceCatalogCommand(uploadCommand(file), 9, { demand: true, user: f.user, role: 'editor', project: 'p', physicalKey: 'id:new-physical' });
  assert.equal(f.counts.full, 0);
  assert.equal(f.counts.part, 1);
  const complete = await f.full();
  assert.deepEqual(complete.files[0], file);
  assert.deepEqual(f.root()._fileCatalog.accounting, createCatalogAccounting(complete));
  const incoming = f.payload();
  incoming.tasks[0].attachments = incoming.tasks[0].attachments.filter(item => item.id !== file.id);
  incoming.trash = [
    { id: 'trash-new', kind: 'file', name: file.name, deletedAt: Date.now(), deletedBy: 'me', data: { file, attachment: file } },
    ...incoming.trash,
  ];
  assert.ok(await tryMutateWorkspaceFileRemoval(incoming, { upsert: [], remove: [file.id] }, 10, f.user, []));
  const removed = await f.full();
  assert.deepEqual(removed.files, f.raw.files);
  assert.deepEqual(removed.trash[0].data.file, file);
  assert.deepEqual(removed.tasks[0].attachments, f.raw.tasks[0].attachments);
  assert.deepEqual(f.root()._fileCatalog.accounting, createCatalogAccounting(removed));
  assert.equal(removed._fileRegistry['id:new-physical'].verified, true);
  assert.equal(f.counts.full, 0);
});

test('upload preflight skips parts only for provably new physical identities; repeated completion retains full duplicate detection', async t => {
  const f = await fixture(t);
  assert.equal((await getWorkspaceUploadSnapshot('id:brand-new')).files.length, 0);
  assert.equal(f.counts.part, 0);
  assert.deepEqual((await getWorkspaceUploadSnapshot('id:physical')).files[0].history, ['canonical']);
  assert.equal(f.counts.part, 2);
});

test('alias removal retains an active physical object, then accounts for retention after its final logical reference', async t => {
  const f = await fixture(t);
  const alias = { ...f.raw.files[0], id: 'alias', by: 'me' };
  await mutateWorkspaceCatalogCommand(uploadCommand(alias), 9, { demand: true, user: f.user, role: 'editor', project: 'p' });
  assert.equal(f.root()._fileCatalog.accounting.fileStorage.aliases, 1);
  for (const id of ['alias', 'f']) {
    await mutateWorkspaceCatalogCommand(
      data => {
        const file = data.files.find(file => file.id === id);
        retainDetachedFile(data, file);
        data.files = data.files.filter(file => file.id !== id);
        return data;
      },
      f.root().revision,
      { demand: true, user: f.user, role: 'editor', ids: [id] },
    );
    assert.deepEqual(f.root()._fileCatalog.accounting, createCatalogAccounting(await f.full()));
  }
  assert.equal(f.root()._fileCatalog.accounting.fileStorage.activePhysical.files, 0);
  assert.equal(f.root()._fileCatalog.accounting.fileStorage.retainedPhysical.knownBytes, 12);
});

test('scoped delta publication retains latest target ACLs and never overwrites a concurrent root', async t => {
  const f = await fixture(t);
  const file = { id: 'new', name: 'New.txt', project: 'private', bytes: 3 };
  await assert.rejects(mutateWorkspaceCatalogCommand(uploadCommand(file), 9, { demand: true, user: f.user, role: 'editor', project: 'p' }), {
    code: 'FILE_FORBIDDEN',
  });
  assert.equal(f.counts.uploads, 0);
  f.race(root => {
    root.revision++;
    root.projects[0].name = 'Concurrent';
  });
  await assert.rejects(
    mutateWorkspaceCatalogCommand(uploadCommand({ ...file, project: 'p' }), 9, { demand: true, user: f.user, role: 'editor', project: 'p' }),
    { code: 'REVISION_CONFLICT' },
  );
  assert.equal(f.root().projects[0].name, 'Concurrent');
  assert.equal(f.counts.writes, 0);
});

test('legacy reference indexes use canonical fallback; stale/private commands and forged trash never publish', async t => {
  const f = await fixture(t);
  const file = { id: 'new', name: 'New.txt', project: 'p', bytes: 3 };
  await assert.rejects(mutateWorkspaceCatalogCommand(uploadCommand(file), 8, { demand: true, user: f.user, role: 'editor', project: 'p' }), {
    code: 'REVISION_CONFLICT',
  });
  await assert.rejects(
    mutateWorkspaceCatalogCommand(uploadCommand({ ...file, project: 'private' }), 9, { demand: true, user: f.user, role: 'editor', project: 'private' }),
    { code: 'FILE_FORBIDDEN' },
  );
  assert.equal(f.counts.part, 0);
  const incoming = f.payload();
  incoming.trash = [{ id: 'fake', kind: 'file', deletedAt: Date.now(), deletedBy: 'me', data: { file: { ...f.raw.files[0], storageName: 'forged' } } }];
  assert.equal(await tryMutateWorkspaceFileRemoval(incoming, { upsert: [], remove: ['f'] }, 9, f.user, []), null);
  assert.equal(f.counts.writes, 0);
  delete f.root()._fileCatalog.physicalReferences;
  await mutateWorkspaceCatalogCommand(uploadCommand(file), 9, { demand: true, user: f.user, role: 'editor', project: 'p' });
  assert.equal(f.counts.full, 1);
  assert.ok(f.root()._fileCatalog.physicalReferences);
});

test('lost coordination ownership after staging prevents publication and snapshots ignore the mutable provider cursor', async t => {
  const f = await fixture(t);
  const snapshot = await f.drive.loadDatabaseFilePatch(new Set(['f']), () => true);
  f.drive.databaseEtag = 'unrelated-cursor';
  const files = snapshot.files.map(file => ({ ...file, name: 'Staged' }));
  let checks = 0;
  await assert.rejects(
    f.drive.saveDatabaseFilePatch(snapshot, files, f.root().tasks, 10, new Date().toISOString(), () => {
      if (++checks > 1) throw new Error('Lease lost');
    }),
    /Lease lost/,
  );
  assert.equal(f.counts.writes, 0);
  assert.equal((await f.full()).files[0].name, 'Guide.txt');
  // The same issued snapshot remains bound to v9 rather than databaseEtag.
  assert.ok(await f.drive.saveDatabaseFilePatch(snapshot, files, f.root().tasks, 10, new Date().toISOString()));
  assert.equal(f.counts.writes, 1);
});

test('HTTP demand file edits preserve ACL-filtered relations/totals and refresh full content on demand', async t => {
  const f = await fixture(t);
  const keys = ['SESSION_SECRET', 'ACCESS_IDS_JSON'];
  const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SESSION_SECRET = 'isolated-file-patch-session-secret';
  const profile = { id: 'me', role: 'editor', name: 'Member', accessId: 'isolated-file-patch' };
  process.env.ACCESS_IDS_JSON = JSON.stringify([profile]);
  t.after(() => {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });
  let sessions = [];
  f.storage.loadAuthSessions = async () => structuredClone(sessions);
  f.storage.saveAuthSessions = async records => {
    sessions = structuredClone(records);
  };
  const { app } = await import('../../src/server/app.js');
  const { createSession } = await import('../../src/server/auth.js');
  const { registerAuthSession } = await import('../../src/server/auth-session-store.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const sessionId = 'file-patch-session',
    issuedAt = Date.now(),
    expiresAt = issuedAt + 3600000;
  await registerAuthSession({ id: sessionId, userId: 'me', createdAt: issuedAt, lastSeenAt: issuedAt, expiresAt });
  const token = createSession(profile, { sessionId, issuedAt, expiresAt });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Smena-File-Catalog': 'demand' };
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Match the member profile binding and metadata removal used by the browser.
  const response = await fetch(`${origin}/api/workspace`, { headers });
  assert.equal(response.status, 200);
  const initial = (await response.json()).data;
  const { schemaVersion, revision, createdAt, updatedAt, workspace, ...incoming } = initial;
  void schemaVersion;
  void revision;
  void createdAt;
  void updatedAt;
  void workspace;
  const renamed = { ...f.raw.files[0], name: 'HTTP Русский.md' };
  const saved = await fetch(`${origin}/api/workspace`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: incoming, revision: 9, fileChanges: { upsert: [renamed], remove: [] } }),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const body = await saved.json();
  assert.deepEqual(body.fileCatalog, { total: 1, mode: 'demand' });
  assert.equal(Object.hasOwn(body.data, 'files'), false);
  assert.deepEqual(
    body.data.relations.map(edge => edge.id),
    ['r'],
  );
  assert.equal(f.counts.full, 0);
  assert.equal(f.counts.part, 1);
  assert.equal((await f.full()).files[0].name, 'HTTP Русский.md');
  const forbidden = await fetch(`${origin}/api/workspace`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: body.data, revision: 10, fileChanges: { upsert: [{ ...f.raw.files[1], name: 'Private' }], remove: [] } }),
  });
  assert.equal(forbidden.status, 403);
  f.storage.uploadFile = async filename => ({ filename, fileId: 'http-verified-upload' });
  f.storage.deleteFile = async () => assert.fail('A successful upload must not be rolled back');
  const form = new FormData();
  form.set('file', new Blob(['HTTP upload / Загрузка'], { type: 'text/plain' }), 'HTTP-new.txt');
  form.set('project', 'p');
  form.set('revision', '10');
  const uploadHeaders = { ...headers };
  delete uploadHeaders['Content-Type'];
  const uploaded = await fetch(`${origin}/api/files/upload`, { method: 'POST', headers: uploadHeaders, body: form });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const upload = await uploaded.json();
  assert.equal(upload.file.storageFileId, 'http-verified-upload');
  assert.deepEqual(upload.fileCatalog, { total: 2, mode: 'demand' });
  const deleted = await fetch(`${origin}/api/files/${upload.file.id}`, { method: 'DELETE', headers, body: JSON.stringify({ revision: upload.data.revision }) });
  assert.equal(deleted.status, 200, await deleted.clone().text());
  const deletion = await deleted.json();
  assert.equal(deletion.contentRetainedForBackups, true);
  assert.deepEqual(deletion.fileCatalog, { total: 1, mode: 'demand' });
  assert.equal(f.counts.full, 0);
  assert.equal((await f.full())._fileGc.at(-1).storageFileId, 'http-verified-upload');
  const uncertain = new FormData();
  f.storage.uploadFile = async filename => ({ filename, fileId: 'http-uncertain-physical' });
  uncertain.set('file', new Blob(['keep on uncertain publication'], { type: 'text/plain' }), 'HTTP-uncertain.txt');
  uncertain.set('project', 'p');
  uncertain.set('revision', String(f.root().revision));
  const actualDelta = f.storage.saveDatabaseFileDelta;
  f.storage.saveDatabaseFileDelta = async (...args) => {
    await actualDelta(...args);
    throw new Error('Simulated response loss after publication');
  };
  const lost = await fetch(`${origin}/api/files/upload`, { method: 'POST', headers: uploadHeaders, body: uncertain });
  assert.equal(lost.status, 503);
  assert.equal((await f.full()).files[0].name, 'HTTP-uncertain.txt', 'The published reference and content are retained despite response loss');
});
