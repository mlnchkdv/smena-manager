import test from 'node:test';
import assert from 'node:assert/strict';
import { backupJson } from '../../src/server/storage/backup-json.js';
import { GoogleDriveStorageProvider } from '../../src/server/storage/google-drive.js';

test('streamed standalone backups preserve Unicode, full histories, array order and ordinary JSON semantics', () => {
  const data = {
    revision: 9,
    omitted: undefined,
    files: Array.from({ length: 4500 }, (_, i) => ({ id: `f${i}`, name: 'Инструкция 📂.md', history: ['full metadata'] })),
    other: [undefined, null],
    _fileRegistry: { id: { bytes: 5 } },
  };
  const chunks = [...backupJson(data, '2026-10-24', 'Копия')];
  assert.deepEqual(JSON.parse(chunks.join('')), JSON.parse(JSON.stringify({ createdAt: '2026-10-24', label: 'Копия', data })));
  assert.ok(chunks.length > data.files.length);
  assert.ok(Math.max(...chunks.map(s => s.length)) < 200);
});

test('Drive consumes the backup stream and reports exact UTF-8 size without a catalog-sized string', async () => {
  const storage = new GoogleDriveStorageProvider();
  storage.ensureBackupsFolder = async () => 'backups';
  let text = '';
  storage.client = {
    files: {
      create: async request => {
        assert.equal(request.requestBody.appProperties.smenaBackup, 'true');
        for await (const chunk of request.media.body) text += chunk;
        return { data: { id: 'b' } };
      },
    },
  };
  const data = { files: [{ id: 'f', name: 'Русский.md', history: ['keep'] }], revision: 7 };
  const result = await storage.createDatabaseBackup(data, 'Backup');
  assert.deepEqual(JSON.parse(text).data, data);
  assert.equal(result.size, Buffer.byteLength(text));
});

test('serialization/upload failures do not return a successful backup', async () => {
  const storage = new GoogleDriveStorageProvider();
  storage.ensureBackupsFolder = async () => 'backups';
  storage.client = {
    files: {
      create: async request => {
        for await (const chunk of request.media.body) void chunk;
        return { data: { id: 'must-not-return' } };
      },
    },
  };
  const circular = {};
  circular.self = circular;
  await assert.rejects(storage.createDatabaseBackup({ files: [circular] }), /circular/i);
});
