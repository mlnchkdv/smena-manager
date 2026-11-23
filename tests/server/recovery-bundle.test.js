import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { persistKnowledgeVersion } from '../../src/server/knowledge-version-blobs.js';
import { storeKnowledgeBody } from '../../src/server/knowledge-body-store.js';
import { saveBookmarkSnapshot, readBookmarkSnapshot } from '../../src/server/bookmark-snapshots.js';
import { canReadWhiteboard } from '../../src/shared/whiteboards.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { createEmptyDatabase } from '../../src/server/workspace-store.js';
import { LocalStorageProvider } from '../../src/server/storage/local-storage.js';
import { restoreRecoveryBundle, validateRecoveryBundle, writeRecoveryBundle } from '../../src/server/recovery-bundle.js';

test('independent recovery restores metadata and attachments without the source storage and rejects corruption', async t => {
  const root = path.join(process.cwd(), '.data', 'tests', `recovery-${process.pid}`);
  const source = new LocalStorageProvider(path.join(root, 'source', 'workspace.json'));
  source.uploadsPath = path.join(root, 'source', 'uploads');
  source.backupsPath = path.join(root, 'source', 'backups');
  const target = new LocalStorageProvider(path.join(root, 'target', 'workspace.json'));
  target.uploadsPath = path.join(root, 'target', 'uploads');
  target.backupsPath = path.join(root, 'target', 'backups');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const data = createEmptyDatabase();
  const bytes = Buffer.from('Независимое восстановление\n\u0000\u0001\u0002', 'utf8');
  const stored = await source.uploadFile('source.bin', bytes, 'text/plain');
  data.files = [
    { id: 'file', project: 'p', name: 'Test.txt', storageName: stored.filename, storageFileId: stored.fileId, bytes: bytes.length, mimeType: 'text/plain' },
  ];
  data.files.push({ ...data.files[0], id: 'alias' });
  data.projects = [{ id: 'p', name: 'Recovered project', members: [] }];
  data.tasks = [{ id: 't', project: 'p', title: 'Recovered task' }];
  data.knowledgeNotes = [{ id: 'n', title: 'Knowledge', formatted_markdown: '# Preserved' }];
  data.links = [{ id: 'l', url: 'https://example.test' }];
  const note = data.knowledgeNotes[0];
  note.history = [await persistKnowledgeVersion(source, note.id, { ...note, id: 'v1', formatted_markdown: '# Earlier' })];
  data.knowledgeNotes = [await storeKnowledgeBody(source, note)];
  const link = data.links[0],
    now = new Date().toISOString();
  const page = {
    url: link.url,
    html: '<p>Archived evidence</p>',
    document: '<html><body><p>Archived evidence</p></body></html>',
    format: 'html',
    capturedAt: now,
  };
  link.pageSnapshots = [await saveBookmarkSnapshot(source, 'default', link, page)];
  data.projects[0] = { ...data.projects[0], visibility: 'private', private: true, lead: 'researcher', members: ['researcher'] };
  data.whiteboards = [
    { id: 'board', name: '3DGS plan', by: 'researcher', at: now, project: 'p', desc: '', archived: false, whiteboard: { version: 1, nodes: [], edges: [] } },
  ];
  async function storeResearch(value) {
    const text = JSON.stringify({ ...value, projectId: 'p', workspaceId: 'default' });
    const sha256 = createHash('sha256').update(text).digest('hex');
    await source.writeResearchObject(text, sha256);
    return { kind: 'smena-research-object-v1', bytes: Buffer.byteLength(text), sha256 };
  }
  const record = await storeResearch({ kind: 'run', id: 'run', title: '3DGS baseline', data: { seed: 42 } });
  data._researchProjects = { p: await storeResearch({ kind: 'smena-research-index-v1', records: [{ id: 'run', ref: record }], operations: {} }) };
  const chunks = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  const result = await writeRecoveryBundle(data, source, output);
  assert.equal(result.assets, 2);
  const bundle = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(validateRecoveryBundle(bundle).size, 2);
  const incomplete = structuredClone(bundle);
  delete incomplete.research[record.sha256];
  assert.throws(() => validateRecoveryBundle(incomplete), /integrity/u);
  const corruptAsset = structuredClone(bundle);
  corruptAsset.assets[0].base64 = Buffer.from('tampered').toString('base64');
  assert.throws(() => validateRecoveryBundle(corruptAsset), /integrity/u);
  const corruptData = structuredClone(bundle);
  corruptData.data.tasks[0].title = 'tampered';
  assert.throws(() => validateRecoveryBundle(corruptData), /integrity/u);
  // Remove the source before restoration: the drill cannot read its files.
  await fs.rm(path.join(root, 'source'), { recursive: true, force: true });
  const restored = await restoreRecoveryBundle(bundle, target);
  assert.deepEqual(restored, { files: 2, tasks: 1, projects: 1 });
  const saved = await target.loadDatabase();
  assert.equal(saved.knowledgeNotes[0].formatted_markdown, '# Preserved');
  assert.equal(saved.knowledgeNotes[0].history[0].formatted_markdown, '# Earlier');
  const recoveredPage = await readBookmarkSnapshot(target, 'default', saved.links[0], link.pageSnapshots[0].id);
  assert.match(recoveredPage.document, /Archived evidence/u);
  const index = JSON.parse(await target.readResearchObject(saved._researchProjects.p.sha256));
  assert.equal(JSON.parse(await target.readResearchObject(index.records[0].ref.sha256)).data.seed, 42);
  assert.equal(canReadWhiteboard(saved, saved.whiteboards[0], 'researcher', 'editor'), true);
  assert.equal(canReadWhiteboard(saved, saved.whiteboards[0], 'outsider', 'editor'), false);
  assert.equal(saved.files[0].storageFileId, saved.files[1].storageFileId);
  const download = await target.openDownloadStream(saved.files[0].storageName, saved.files[0].storageFileId);
  const actual = [];
  for await (const chunk of download.stream) actual.push(chunk);
  assert.deepEqual(Buffer.concat(actual), bytes);
  await assert.rejects(restoreRecoveryBundle(bundle, target), /must be empty/u);

  const failing = new LocalStorageProvider(path.join(root, 'failing', 'workspace.json'));
  failing.uploadsPath = path.join(root, 'failing', 'uploads');
  failing.saveDatabase = async () => {
    throw new Error('Injected attachment failure');
  };
  await assert.rejects(restoreRecoveryBundle(bundle, failing), /Injected attachment failure/u);
  assert.equal(await failing.loadDatabase(), null);
  assert.deepEqual(await fs.readdir(failing.uploadsPath), []);
});
