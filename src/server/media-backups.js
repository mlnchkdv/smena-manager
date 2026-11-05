import { randomUUID } from 'node:crypto';
import { memberForProfile } from '../shared/member-identity.js';
import { canReadProject, canEditProject } from '../shared/project-access.js';
import { registerFileMetadata } from './file-registry.js';
import { formatFileSize } from './file-policy.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
const fail = () => Object.assign(Error('Media backup is unavailable. Check access and retry.'), { statusCode: 403, code: 'MEDIA_BACKUP_UNAVAILABLE' });
export function mediaBackupService({ load, mutate, storage, now = Date.now }) {
  const access = (data, user, project, edit = false) => {
    const member = memberForProfile(data, user);
    if (
      !member ||
      ['removed', 'deactivated'].includes(member.status) ||
      !(edit ? canEditProject : canReadProject)(
        data.projects?.find(item => item.id === project),
        member.id,
        workspaceMemberRole(member),
      )
    )
      throw fail();
    return member.id;
  };
  const owned = (data, user, id) => {
    const job = data._mediaBackups?.find(item => item.id === id && item.owner === user.id);
    if (!job) throw fail();
    job.entries.forEach(entry => access(data, user, entry.file.project));
    return job;
  };
  const summary = job => ({
    id: job.id,
    createdAt: job.createdAt,
    files: job.entries.length,
    done: job.entries.filter(entry => entry.copy).length,
    bytes: job.entries.reduce((sum, entry) => sum + entry.file.bytes, 0),
    ready: job.ready,
  });
  const write = async change => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const data = await load();
      let result;
      try {
        await mutate(
          current => {
            result = change(current);
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
  };
  return {
    async list(user) {
      const data = await load();
      return (data._mediaBackups || [])
        .filter(job => {
          try {
            owned(data, user, job.id);
            return true;
          } catch {
            return false;
          }
        })
        .map(summary);
    },
    async create(user, ids) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw fail();
      return summary(
        await write(data => {
          data._mediaBackups ||= [];
          if (data._mediaBackups.length >= 16 || data._mediaBackups.filter(job => job.owner === user.id && !job.archived).length >= 4)
            throw Object.assign(Error('Media backup limit reached (four per account).'), { statusCode: 429, code: 'MEDIA_BACKUP_LIMIT' });
          const entries = ids.map(id => {
            const file = data.files.find(item => item.id === id);
            if (!file?.storageName || !Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw fail();
            access(data, user, file.project);
            return { file: structuredClone(file) };
          });
          const job = { id: randomUUID(), owner: user.id, createdAt: now(), entries, ready: false };
          data._mediaBackups.push(job);
          return job;
        }),
      );
    },
    async advance(user, id) {
      const lease = randomUUID();
      const job = await write(data => {
        const job = owned(data, user, id);
        if (job.ready) return job;
        if (job.lease?.until > now()) throw Object.assign(Error('Backup is busy. Retry later.'), { statusCode: 409, code: 'MEDIA_BACKUP_BUSY' });
        job.lease = { id: lease, until: now() + 120000 };
        return job;
      });
      if (job.ready) return summary(job);
      try {
        const index = job.entries.findIndex(entry => !entry.copy);
        if (index >= 0) {
          const entry = job.entries[index];
          const fresh = await load();
          owned(fresh, user, id);
          const current = fresh.files.find(file => file.id === entry.file.id);
          if (
            !current ||
            current.storageFileId !== entry.file.storageFileId ||
            current.storageName !== entry.file.storageName ||
            current.bytes !== entry.file.bytes
          )
            throw fail();
          const copy = await storage.copyMediaObject(entry.file, `media-${id}-${index}`);
          await write(data => {
            const active = owned(data, user, id);
            if (active.lease?.id !== lease || active.lease.until <= now()) throw fail();
            const file = data.files.find(file => file.id === entry.file.id);
            if (!file || file.storageFileId !== entry.file.storageFileId || file.storageName !== entry.file.storageName || file.bytes !== entry.file.bytes)
              throw fail();
            active.entries[index].copy = copy;
            active.lease = null;
            return active;
          });
        }
        const latest = owned(await load(), user, id);
        if (latest.entries.every(entry => entry.copy)) {
          await storage.saveMediaManifest({ ...latest, ready: true, lease: null });
          return summary(
            await write(data => {
              const active = owned(data, user, id);
              active.ready = true;
              active.lease = null;
              return active;
            }),
          );
        }
        return summary(latest);
      } catch (error) {
        await write(data => {
          const active = data._mediaBackups?.find(job => job.id === id && job.owner === user.id);
          if (active?.lease?.id === lease) active.lease = null;
          return active;
        }).catch(() => {});
        throw error;
      }
    },
    async manifest(user, id) {
      const job = owned(await load(), user, id);
      if (!job.ready) throw fail();
      return { format: 'smena-media-v1', ...job };
    },
    async restore(user, id, project, index) {
      const before = await load(),
        job = owned(before, user, id);
      access(before, user, project, true);
      if (!job.ready || !Number.isInteger(index) || !job.entries[index]?.copy) throw fail();
      const entry = job.entries[index],
        ref = `${id}:${index}:${project}`;
      const copy = await storage.copyMediaObject(entry.copy, `media-restore-${id}-${index}-${Buffer.from(project).toString('hex')}`, {
        fromBackup: true,
        toBackup: false,
      });
      return write(data => {
        owned(data, user, id);
        const by = access(data, user, project, true);
        // The public file payload may contain a client-supplied reference. Reuse
        // only a record that also points at the verified restore object.
        const existing = data.files.find(
          file =>
            file.mediaBackupRef === ref &&
            file.project === project &&
            file.ownerId === user.id &&
            file.storageFileId === copy.storageFileId &&
            file.storageName === copy.storageName &&
            file.bytes === copy.bytes,
        );
        if (existing) return existing;
        const file = {
          ...entry.file,
          ...copy,
          id: `file-${randomUUID()}`,
          project,
          task: null,
          folderId: null,
          at: now(),
          by,
          ownerId: user.id,
          mediaBackupRef: ref,
          size: formatFileSize(copy.bytes),
        };
        data.files.unshift(file);
        registerFileMetadata(data, file, true);
        return file;
      });
    },
  };
}
