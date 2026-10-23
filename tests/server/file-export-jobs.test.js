import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { unzipSync } from 'fflate';
import { createFileExportService, EXPORT_PART_BYTES, EXPORT_TTL } from '../../src/server/file-export-jobs.js';
import { exportZipLayout, updateCrc32, exportDigest, readExportPart } from '../../src/server/file-export-zip.js';
import { exportRange } from '../../src/server/file-export-routes.js';
function fixture(size = EXPORT_PART_BYTES + 19) {
  const source = Buffer.alloc(size, 123),
    bytes = new Map([['source', source]]);
  let data = {
      revision: 1,
      ws: { id: 'workspace' },
      members: [{ id: 'm', role: 'Owner' }],
      projects: [{ id: 'p', name: 'Проект' }],
      tasks: [],
      files: [{ id: 'f', project: 'p', name: 'Тест.txt', bytes: size, storageName: 'source', storageFileId: 'source' }],
    },
    time = 100;
  const options = {
    now: () => time,
    load: async () => structuredClone(data),
    mutate: async (change, revision) => {
      if (revision !== data.revision) throw Object.assign(Error('conflict'), { code: 'REVISION_CONFLICT' });
      const next = change(structuredClone(data));
      next.revision++;
      data = next;
      return next;
    },
    storage: {
      async getUploadMetadata(name) {
        const buffer = bytes.get(name);
        return buffer ? { id: name, name, size: buffer.length, md5Checksum: exportDigest(buffer) } : null;
      },
      async openDownloadStream(name, id, range) {
        const buffer = bytes.get(name);
        if (!buffer) return null;
        return { size: buffer.length, stream: Readable.from(range ? buffer.subarray(range.start, range.end + 1) : buffer) };
      },
      async uploadFile(name, buffer) {
        bytes.set(name, Buffer.from(buffer));
        return { fileId: name, filename: name, size: buffer.length };
      },
    },
  };
  return { options, bytes, source, data: () => data, setTime: value => (time = value) };
}
const user = { id: 'm', role: 'admin' };
test('export checkpoints survive service restart; deterministic ZIP has correct CRC, paths and bytes', async () => {
  const f = fixture(),
    service = createFileExportService(f.options),
    job = await service.create(user, ['f']);
  assert.equal((await service.advance(user, job.id)).done, EXPORT_PART_BYTES);
  const resumed = createFileExportService(f.options);
  assert.equal((await resumed.list(user))[0].done, EXPORT_PART_BYTES);
  assert.equal((await resumed.advance(user, job.id)).phase, 'ready');
  const result = await resumed.result(user, job.id),
    again = exportZipLayout(result.job.entries);
  assert.equal(result.layout.digest, again.digest);
  const buffer = Buffer.concat(result.layout.segments.map(segment => segment.buffer || f.bytes.get(segment.part.storageName)));
  assert.equal(buffer.length, result.layout.bytes);
  assert.deepEqual(Buffer.from(unzipSync(buffer)['Проект/Тест.txt']), f.source);
  assert.equal(updateCrc32(0, Buffer.from('123456789')), 0xcbf43926);
  assert.equal(exportDigest(buffer), exportDigest(Buffer.from(buffer)));
  assert.deepEqual(exportRange('bytes=5-19', buffer.length), { start: 5, end: 19, partial: true });
  assert.equal(exportRange('bytes=0-1,4-9', 20), null);
  assert.equal(exportRange('bytes=20-', 20), null);
});
test('jobs enforce ownership, shared quotas, expiry and ACL checks on every continuation/result', async () => {
  const f = fixture(10),
    service = createFileExportService(f.options),
    job = await service.create(user, ['f']);
  await assert.rejects(service.create(user, ['f']), { code: 'EXPORT_QUOTA' });
  await assert.rejects(service.advance({ ...user, id: 'other' }, job.id), { statusCode: 404 });
  const saved = f.data()._fileExportJobs[0];
  saved.lease = { id: 'other-worker', expiresAt: 40000 };
  await assert.rejects(service.advance(user, job.id), { code: 'EXPORT_BUSY' });
  f.setTime(40001);
  assert.equal((await service.advance(user, job.id)).phase, 'ready');
  f.data().projects[0].archived = true;
  await assert.rejects(service.result(user, job.id), { statusCode: 403 });
  f.data().projects[0].archived = false;
  f.setTime(EXPORT_TTL + 101);
  await assert.rejects(service.result(user, job.id), { code: 'EXPORT_EXPIRED' });
  assert.equal((await service.list(user))[0].phase, 'expired');
});
test('cancelled exports cannot resume or expose a ready result; part reads reject truncation', async () => {
  const f = fixture(10),
    service = createFileExportService(f.options),
    job = await service.create(user, ['f']);
  await service.cancel(user, job.id);
  await assert.rejects(service.advance(user, job.id), { code: 'EXPORT_EXPIRED' });
  await assert.rejects(readExportPart(f.options.storage, { storageName: 'source' }, { expectedSize: 11 }), /size changed/);
});
test('an unknown upload outcome reuses its persisted staging object; changed sources cannot resume', async () => {
  const f = fixture(EXPORT_PART_BYTES + 1),
    service = createFileExportService(f.options),
    job = await service.create(user, ['f']);
  const upload = f.options.storage.uploadFile;
  let calls = 0;
  f.options.storage.uploadFile = async (...args) => {
    calls++;
    const result = await upload(...args);
    if (calls === 1) throw Error('timeout after write');
    return result;
  };
  await assert.rejects(service.advance(user, job.id), /timeout/);
  assert.equal(f.data()._fileExportJobs[0].phase, 'failed');
  assert.ok(f.data()._fileExportJobs[0].staging.storageName);
  assert.equal((await createFileExportService(f.options).advance(user, job.id)).done, EXPORT_PART_BYTES);
  assert.equal(calls, 1);
  f.bytes.get('source')[0] = 4;
  await assert.rejects(service.advance(user, job.id), /source file changed/);
  assert.notEqual(f.data()._fileExportJobs[0].phase, 'ready');
});
