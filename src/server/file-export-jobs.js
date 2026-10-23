import { randomUUID } from 'node:crypto';
import { createFileArchivePlan } from '../shared/file-archive-policy.js';
import { memberForProfile } from '../shared/member-identity.js';
import { assertArchiveFileAccess } from './file-archive-access.js';
import { updateCrc32, exportDigest, readExportPart, exportZipLayout } from './file-export-zip.js';
import { retainDetachedFile } from './file-retention.js';
import { registerFileMetadata } from './file-registry.js';

export const EXPORT_PART_BYTES = 4 * 1024 * 1024;
export const EXPORT_TTL = 24 * 3600000;
const policy = { maxFiles: 500, maxBytes: 1024 * 1024 * 1024, limitMessage: 'A resumable export supports up to 500 files and 1 GB.' };
const fail = (message, statusCode = 409, code = 'EXPORT_UNAVAILABLE') => Object.assign(new Error(message), { statusCode, code });
const workspace = data => data.ws?.id || data.ws?.url || data.workspace?.id || 'workspace';
const live = (job, now) => job.expiresAt > now && job.phase !== 'cancelled';

export function createFileExportService({ load, mutate, storage, now = Date.now }) {
  async function write(change) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await load();
      let result;
      try {
        await mutate(
          current => {
            result = change(current);
            if (Buffer.byteLength(JSON.stringify(current._fileExportJobs || [])) > 8 * 1024 * 1024)
              throw fail('Export metadata capacity reached. Cancel or expire older jobs.', 413, 'EXPORT_QUOTA');
            return current;
          },
          data.revision,
          { outboxWorker: true },
        );
        return structuredClone(result);
      } catch (error) {
        if (error.code !== 'REVISION_CONFLICT' || attempt === 3) throw error;
      }
    }
  }
  function owned(data, user, id) {
    const job = data._fileExportJobs?.find(job => job.id === id && job.owner === user.id && job.workspace === workspace(data));
    if (!job) throw fail('Export is unavailable.', 404);
    return job;
  }
  function validate(data, user, job) {
    if (!live(job, now())) throw fail('Export expired or was cancelled.', 410, 'EXPORT_EXPIRED');
    for (const entry of job.entries) {
      const current = assertArchiveFileAccess(data, user, entry.file);
      if (current.bytes !== entry.file.bytes) throw fail('The selected files changed. Select them again.', 403);
    }
  }
  const summary = job => ({
    id: job.id,
    phase: live(job, now()) ? job.phase : job.phase === 'cancelled' ? 'cancelled' : 'expired',
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    total: job.entries.reduce((sum, item) => sum + item.file.bytes, 0),
    done: job.entries.reduce((sum, item) => sum + item.offset, 0),
    files: job.entries.length,
    bytes: job.result?.bytes,
    digest: job.result?.digest,
  });
  return {
    async list(user) {
      const data = await load();
      return (data._fileExportJobs || [])
        .filter(job => job.owner === user.id && job.workspace === workspace(data))
        .map(job => {
          try {
            validate(data, user, job);
            return summary(job);
          } catch {
            return { ...summary(job), phase: !live(job, now()) ? summary(job).phase : 'unavailable' };
          }
        });
    },
    async create(user, ids) {
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw fail('Invalid file selection.', 400);
      return summary(
        await write(data => {
          data._fileExportJobs = (data._fileExportJobs || []).filter(job => live(job, now()));
          if (
            data._fileExportJobs.length >= 16 ||
            data._fileExportJobs.filter(job => job.owner === user.id).length >= 4 ||
            data._fileExportJobs.some(job => job.owner === user.id && ['pending', 'processing', 'failed'].includes(job.phase))
          )
            throw fail('Another export is still pending. Resume or cancel it first.', 429, 'EXPORT_QUOTA');
          const plan = createFileArchivePlan({ ...data, me: memberForProfile(data, user)?.id }, ids, user.role, policy);
          if (plan.some(item => !Number.isSafeInteger(item.file.bytes) || item.file.bytes < 0)) throw fail('File size is unknown. Export is unavailable.', 400);
          for (const entry of plan) assertArchiveFileAccess(data, user, entry.file);
          const job = {
            id: randomUUID(),
            owner: user.id,
            workspace: workspace(data),
            phase: 'pending',
            createdAt: now(),
            expiresAt: now() + EXPORT_TTL,
            entries: plan.map(entry => ({
              path: entry.path,
              file: Object.fromEntries(['id', 'project', 'name', 'storageName', 'storageFileId', 'bytes'].map(key => [key, entry.file[key]])),
              offset: 0,
              crc: 0,
              parts: [],
            })),
            lease: null,
          };
          data._fileExportJobs.push(job);
          return job;
        }),
      );
    },
    async advance(user, id) {
      const signal = AbortSignal.timeout(45000);
      const lease = randomUUID();
      const claimed = await write(data => {
        const job = owned(data, user, id);
        validate(data, user, job);
        if (job.phase === 'ready') return job;
        if (job.lease?.expiresAt > now()) throw fail('Export is being prepared in another tab. Retry later.', 409, 'EXPORT_BUSY');
        if ((data._fileExportJobs || []).filter(item => item.lease?.expiresAt > now()).length >= 4)
          throw fail('Export workers are busy. Retry later.', 429, 'EXPORT_QUOTA');
        job.lease = { id: lease, expiresAt: now() + 55000 };
        job.phase = 'processing';
        const index = job.entries.findIndex(entry => entry.offset < entry.file.bytes || (entry.file.bytes === 0 && !entry.emptyDone));
        const entry = job.entries[index];
        if (entry?.file.bytes && (!job.staging || job.staging.index !== index || job.staging.offset !== entry.offset)) {
          job.staging = { index, offset: entry.offset, storageName: `export-${job.id}-${randomUUID()}.part` };
          retainDetachedFile(data, job.staging, now());
        }
        return job;
      });
      if (claimed.phase === 'ready') return summary(claimed);
      const index = claimed.entries.findIndex(entry => entry.offset < entry.file.bytes || (!entry.parts.length && entry.file.bytes === 0 && !entry.emptyDone));
      let stored;
      try {
        const entry = claimed.entries[index];
        if (!entry) throw fail('Invalid export checkpoint.');
        signal.throwIfAborted();
        const before = await storage.getUploadMetadata(entry.file.storageName, entry.file.storageFileId, { signal });
        const sourceVersion = before?.md5Checksum || before?.version;
        if (!sourceVersion || (entry.sourceVersion && entry.sourceVersion !== sourceVersion)) throw fail('The source file changed. Create a new export.', 409);
        const size = Math.min(EXPORT_PART_BYTES, entry.file.bytes - entry.offset);
        const bytes = size
          ? await readExportPart(storage, entry.file, {
              start: entry.offset,
              end: entry.offset + size - 1,
              expectedSize: size,
              signal,
            })
          : Buffer.alloc(0);
        const sha256 = exportDigest(bytes);
        signal.throwIfAborted();
        const after = await storage.getUploadMetadata(entry.file.storageName, entry.file.storageFileId, { signal });
        if ((after?.md5Checksum || after?.version) !== sourceVersion) throw fail('The source file changed. Create a new export.', 409);
        if (size) {
          const existing = await storage.getUploadMetadata(claimed.staging.storageName, undefined, { signal });
          if (existing) {
            const part = { storageName: claimed.staging.storageName, storageFileId: existing.id, bytes: Number(existing.size) };
            const saved = await readExportPart(storage, part, { expectedSize: size, signal });
            if (exportDigest(saved) !== sha256) throw fail('Export checksum does not match.');
            stored = { fileId: existing.id, filename: part.storageName, size };
          } else stored = await storage.uploadFile(claimed.staging.storageName, bytes, 'application/octet-stream', { signal });
          if (stored.size !== size) throw fail('Stored export size changed.');
        }
        return summary(
          await write(data => {
            const job = owned(data, user, id);
            validate(data, user, job);
            if (job.lease?.id !== lease || job.lease.expiresAt <= now() || job.entries[index].offset !== entry.offset)
              throw fail('Export lease expired. Resume from the saved checkpoint.', 409, 'EXPORT_BUSY');
            const target = job.entries[index];
            target.sourceVersion = sourceVersion;
            if (size) {
              const part = { storageFileId: stored.fileId, storageName: stored.filename, bytes: size, sha256 };
              target.parts.push(part);
              data._fileGc = (data._fileGc || []).filter(record => record.storageName !== part.storageName);
              registerFileMetadata(data, part, true);
              retainDetachedFile(data, part, now());
            } else target.emptyDone = true;
            target.offset += size;
            target.crc = updateCrc32(target.crc, bytes);
            job.staging = null;
            job.lease = null;
            const complete = job.entries.every(entry => entry.offset === entry.file.bytes && (entry.file.bytes > 0 || entry.emptyDone));
            job.phase = complete ? 'ready' : 'pending';
            if (complete) {
              const layout = exportZipLayout(job.entries);
              job.result = { bytes: layout.bytes, digest: layout.digest };
            }
            return job;
          }),
        );
      } catch (error) {
        // Failed/late writes cannot publish partial results. Unreferenced temporary
        // objects are retained for normal recovery/GC, never deleted on request.
        await write(data => {
          const job = owned(data, user, id);
          if (stored) retainDetachedFile(data, { storageName: stored.filename, storageFileId: stored.fileId }, now());
          if (job.lease?.id === lease) {
            job.lease = null;
            if (live(job, now())) job.phase = 'failed';
          }
          return job;
        }).catch(() => {});
        throw error;
      }
    },
    async cancel(user, id) {
      return summary(
        await write(data => {
          const job = owned(data, user, id);
          job.phase = 'cancelled';
          job.lease = null;
          return job;
        }),
      );
    },
    async result(user, id) {
      const data = await load(),
        job = owned(data, user, id);
      validate(data, user, job);
      if (job.phase !== 'ready') throw fail('Export is not ready.');
      const layout = exportZipLayout(job.entries);
      if (job.result?.digest !== layout.digest || job.result.bytes !== layout.bytes) throw fail('Export checksum does not match.');
      return { job, layout };
    },
    async validate(user, id) {
      const data = await load();
      validate(data, user, owned(data, user, id));
    },
  };
}
