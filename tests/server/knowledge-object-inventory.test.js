import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { localKnowledgeInventory, driveKnowledgeInventory } from '../../src/server/storage/knowledge-object-inventory.js';

const hash = text => createHash('sha256').update(text).digest('hex');
async function local(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-inventory-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, api: localKnowledgeInventory({ databasePath: path.join(directory, 'root.json'), backupsPath: path.join(directory, 'backups') }) };
}
test('local inventory is read-only, paged, resumable and bound to a namespace', async t => {
  const { directory, api } = await local(t);
  assert.deepEqual(await api.listKnowledgeObjectInventory({ scope: 'body' }), { items: [], cursor: null });
  assert.deepEqual(await fs.readdir(directory), []); // no mkdir/bootstrap on a read
  const folder = path.join(directory, 'knowledge-bodies');
  await fs.mkdir(folder);
  const texts = Array.from({ length: 7 }, (_, index) =>
    JSON.stringify({ format: 'smena-knowledge-body-v1', noteId: String(index), formatted_markdown: 'note ' + index }),
  );
  for (const text of texts) await fs.writeFile(path.join(folder, hash(text) + '.json'), text);
  const first = await api.listKnowledgeObjectInventory({ scope: 'body', limit: 3 });
  assert.equal(first.items.length, 3);
  assert.ok(first.cursor);
  assert.ok(first.items.every(item => item.owned && !item.integrityChecked && !item.recognizedFormat));
  const second = await api.listKnowledgeObjectInventory({ scope: 'body', limit: 3, cursor: JSON.parse(JSON.stringify(first.cursor)) });
  const last = await api.listKnowledgeObjectInventory({ scope: 'body', limit: 3, cursor: second.cursor });
  assert.equal(last.cursor, null);
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map(item => item.id)).size, 7);
  const read = await api.readKnowledgeInventoryObject(first.items[0]);
  assert.ok(texts.includes(read.text));
  assert.equal(read.integrityChecked, true);
  assert.ok(!JSON.stringify(first).includes(directory));
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'version', cursor: first.cursor }), /inventory/);
  await fs.writeFile(path.join(folder, 'extra.json'), '{}');
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body', cursor: first.cursor }), { code: 'KNOWLEDGE_INVENTORY_CHANGED' });
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'toString' }), /inventory/);
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body', limit: 101 }), /inventory/);
});
test('local inspection rejects altered bytes, non-JSON and symlinks without reading outside its namespace', async t => {
  const { directory, api } = await local(t),
    folder = path.join(directory, 'knowledge-bodies');
  await fs.mkdir(folder);
  const text = '{"value":1}',
    digest = hash(text),
    target = path.join(folder, digest + '.json');
  await fs.writeFile(target, text);
  const item = (await api.listKnowledgeObjectInventory({ scope: 'body' })).items[0];
  await fs.writeFile(target, '{"value":2}');
  await assert.rejects(api.readKnowledgeInventoryObject(item), { code: 'KNOWLEDGE_INVENTORY_INTEGRITY' });
  const invalid = 'not JSON';
  await fs.writeFile(path.join(folder, hash(invalid) + '.json'), invalid);
  const bad = (await api.listKnowledgeObjectInventory({ scope: 'body' })).items.find(value => value.sha256 === hash(invalid));
  await assert.rejects(api.readKnowledgeInventoryObject(bad), { code: 'KNOWLEDGE_INVENTORY_INTEGRITY' });
  await assert.rejects(api.readKnowledgeInventoryObject({ ...item, id: '../root.json' }), /inventory/);
  const outside = path.join(directory, 'private.json');
  await fs.writeFile(outside, text);
  await fs.unlink(target);
  try {
    await fs.symlink(outside, target, 'file');
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return; // device lacks symlink privilege
    throw error;
  }
  await assert.rejects(api.readKnowledgeInventoryObject(item), { code: 'KNOWLEDGE_INVENTORY_INTEGRITY' });
  assert.ok((await api.listKnowledgeObjectInventory({ scope: 'body' })).items.some(value => !value.owned));
});
test('local inventory rejects a directory junction instead of inspecting its target', async t => {
  const { directory, api } = await local(t),
    outside = path.join(directory, 'unrelated');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(directory, 'knowledge-bodies'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body' }), { code: 'KNOWLEDGE_INVENTORY_INTEGRITY' });
});
function driveFixture() {
  const text = '{"format":"smena-knowledge-body-v1","noteId":"n","formatted_markdown":"Hello"}',
    sha256 = hash(text);
  const file = {
    id: 'physical-1',
    name: `smena-knowledge-body-${sha256}.json`,
    size: String(Buffer.byteLength(text)),
    createdTime: '2026-01-01T00:00:00Z',
    mimeType: 'application/json',
    parents: ['root'],
    appProperties: { smenaKnowledgeBody: '1' },
  };
  const calls = [],
    storage = {
      rootFolderId: 'root',
      client: {
        files: {
          async list(args) {
            calls.push(['list', args]);
            return { data: { files: [file], nextPageToken: 'page-2' } };
          },
          async get(args) {
            calls.push(['get', args]);
            return { data: args.alt ? Readable.from([text]) : file };
          },
          async create() {
            throw Error('Read-only inventory must never create');
          },
          async update() {
            throw Error('Read-only inventory must never update');
          },
          async delete() {
            throw Error('Read-only inventory must never delete');
          },
        },
      },
    };
  return { storage, file, text, sha256, calls, api: driveKnowledgeInventory(storage) };
}
test('Drive inventory preserves physical identity and validates parent/marker before bounded media read', async () => {
  const { api, storage, file, text, calls } = driveFixture();
  const first = await api.listKnowledgeObjectInventory({ scope: 'body', limit: 10 });
  assert.equal(first.items[0].id, 'physical-1');
  assert.equal(first.items[0].recognizedFormat, undefined);
  assert.equal((await api.readKnowledgeInventoryObject(first.items[0])).text, text);
  assert.equal(calls.filter(([kind, args]) => kind === 'get' && args.alt).length, 1);
  file.parents = ['foreign'];
  await assert.rejects(api.readKnowledgeInventoryObject(first.items[0]), /inventory/);
  assert.equal(calls.filter(([kind, args]) => kind === 'get' && args.alt).length, 1);
  storage.rootFolderId = 'another-workspace';
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body', cursor: first.cursor }), /inventory/);
});
test('Drive failures, malformed pages and repeated page tokens never appear as EOF', async () => {
  const { api, storage, file } = driveFixture();
  const first = await api.listKnowledgeObjectInventory({ scope: 'body' });
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body', cursor: first.cursor }), /inventory/);
  storage.client.files.list = async () => {
    throw Object.assign(Error('Unavailable'), { status: 503 });
  };
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body' }), /Unavailable/);
  storage.client.files.list = async () => ({ data: { files: [file, file] } });
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body', limit: 1 }), /inventory/);
  storage.client.files.list = async () => ({ data: { files: [{ ...file, appProperties: {} }] } });
  assert.equal((await api.listKnowledgeObjectInventory({ scope: 'body' })).items[0].owned, false);
  storage.rootFolderId = null;
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body' }), { code: 'KNOWLEDGE_INVENTORY_NOT_INITIALIZED' });
});
test('Drive backup inspection never creates a missing folder and rejects ambiguous or foreign folders', async () => {
  const { api, storage } = driveFixture();
  storage.client.files.list = async () => ({ data: { files: [] } });
  assert.deepEqual(await api.listKnowledgeObjectInventory({ scope: 'backup' }), { items: [], cursor: null });
  const folder = { id: 'backups', name: 'backups', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] };
  storage.client.files.list = async () => ({ data: { files: [folder, folder] } });
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'backup' }), /inventory/);
  folder.parents = ['foreign'];
  storage.client.files.list = async () => ({ data: { files: [folder] } });
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'backup' }), /inventory/);
});
test('Drive exact-id reads reject corrupt or oversized streams and cancellation', async () => {
  const { api, storage, file } = driveFixture(),
    expected = (await api.listKnowledgeObjectInventory({ scope: 'body' })).items[0];
  storage.client.files.get = async args => ({ data: args.alt ? Readable.from(['bad']) : file });
  await assert.rejects(api.readKnowledgeInventoryObject(expected), /inventory/);
  storage.client.files.get = async args => ({ data: args.alt ? Readable.from([Buffer.alloc(16 * 1024 * 1024), Buffer.alloc(1)]) : file });
  await assert.rejects(api.readKnowledgeInventoryObject(expected), /inventory/);
  const controller = new AbortController();
  controller.abort();
  storage.client.files.list = async (args, options) => {
    options.signal.throwIfAborted();
    throw Error('unreachable');
  };
  await assert.rejects(api.listKnowledgeObjectInventory({ scope: 'body', signal: controller.signal }), { name: 'AbortError' });
});
test('local snapshot enumeration reads raw envelopes without expanding note bodies or independent objects', async t => {
  const { directory, api } = await local(t),
    folder = path.join(directory, 'backups');
  await fs.mkdir(path.join(folder, 'objects'), { recursive: true });
  const classic = { createdAt: '2026-11-07T00:00:00Z', data: { notes: [{ id: 'n', bodyRef: { sha256: 'a'.repeat(64), bytes: 12 } }] } };
  const prepared = { format: 'smena-prepared-backup-v1', source: { kind: 'root', sha256: 'b'.repeat(64), bytes: 123 } };
  await fs.writeFile(path.join(folder, 'classic.json'), JSON.stringify(classic));
  await fs.writeFile(path.join(folder, 'prepared.json'), JSON.stringify(prepared));
  const first = await api.listKnowledgeObjectInventory({ scope: 'snapshot', limit: 1 });
  const last = await api.listKnowledgeObjectInventory({ scope: 'snapshot', cursor: first.cursor, limit: 1 });
  assert.equal(last.cursor, null);
  assert.deepEqual(JSON.parse((await api.readKnowledgeInventoryObject(first.items[0])).text), classic);
  assert.deepEqual(JSON.parse((await api.readKnowledgeInventoryObject(last.items[0])).text), prepared);
  assert.equal((await api.readKnowledgeInventoryObject(last.items[0])).integrityChecked, false); // raw envelope is not a verified recovery
  await fs.writeFile(path.join(folder, 'classic.json'), JSON.stringify({ ...classic, label: 'changed' }));
  await assert.rejects(api.readKnowledgeInventoryObject(first.items[0]), /inventory/);
  await assert.rejects(api.readKnowledgeInventoryObject({ ...last.items[0], id: 'snapshot:../private.json' }), /inventory/);
  assert.deepEqual(await fs.readdir(path.join(folder, 'objects')), []);
});
test('Drive snapshot pages require backup ownership and a stable version around the raw read', async () => {
  const { api, storage } = driveFixture(),
    text = JSON.stringify({ format: 'smena-prepared-backup-v1', source: { sha256: 'a'.repeat(64), bytes: 100 } });
  const folder = { id: 'backups', name: 'backups', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] };
  const snapshot = {
    id: 'snapshot-1',
    name: 'prepared.json',
    version: '4',
    size: String(Buffer.byteLength(text)),
    parents: ['backups'],
    mimeType: 'application/json',
    appProperties: { smenaBackup: 'true' },
  };
  storage.client.files.list = async args => ({ data: { files: args.q.includes('mimeType') ? [folder] : [snapshot] } });
  storage.client.files.get = async args => ({ data: args.alt ? Readable.from([text]) : { ...snapshot } });
  const page = await api.listKnowledgeObjectInventory({ scope: 'snapshot' });
  assert.equal(page.items[0].stamp, '4');
  assert.equal((await api.readKnowledgeInventoryObject(page.items[0])).text, text);
  storage.client.files.get = async args => {
    if (args.alt) {
      snapshot.version = '5';
      return { data: Readable.from([text]) };
    }
    return { data: { ...snapshot } };
  };
  await assert.rejects(api.readKnowledgeInventoryObject(page.items[0]), { code: 'KNOWLEDGE_INVENTORY_CHANGED' });
  snapshot.appProperties = {};
  assert.equal((await api.listKnowledgeObjectInventory({ scope: 'snapshot' })).items[0].owned, false);
});
