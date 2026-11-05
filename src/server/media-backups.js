import { randomUUID } from 'node:crypto';
import { memberForProfile } from '../shared/member-identity.js';
import { canReadProject, canEditProject } from '../shared/project-access.js';
import { registerFileMetadata } from './file-registry.js';
import { formatFileSize } from './file-policy.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { assertFileFolder } from '../shared/file-organization.js';
import { createMediaManifestRecovery } from './media-manifest-recovery.js';
import { uploadCapacity } from '../shared/upload-capacity.js';
import { mediaRestoreRef, mediaRestoreName, mediaRestoreReviewKey, registeredMediaRestore } from './media-restore-plan.js';
import {
  mediaCopyArchived,
  mediaCopySettings,
  MEDIA_COPY_ACTIVE_USER_LIMIT,
  MEDIA_COPY_ACTIVE_WORKSPACE_LIMIT,
  MEDIA_COPY_RETAINED_LIMIT,
} from '../shared/media-copy-lifecycle.js';
const fail = () => Object.assign(Error('Media backup is unavailable. Check access and retry.'), { statusCode: 403, code: 'MEDIA_BACKUP_UNAVAILABLE' });
export function mediaBackupService({ load, mutate, storage, now = Date.now, scope = 'default', resolveSource }) {
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
  const metadataJob = (data, user, id, writable = false) => {
    const member = memberForProfile(data, user);
    const job = data._mediaBackups?.find(item => item.id === id && (item.owner === user.id || workspaceMemberRole(member) === 'admin'));
    if (!member || ['removed', 'deactivated'].includes(member.status) || !job || (writable && !['admin', 'editor'].includes(workspaceMemberRole(member))))
      throw fail();
    return job;
  };
  const owned = (data, user, id) => {
    const job = metadataJob(data, user, id);
    if (!job) throw fail();
    if (job.deleting) throw Object.assign(Error('Copy deletion is in progress.'), { code: 'MEDIA_COPY_DELETING', statusCode: 409 });
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
    label: job.label || '',
    archived: mediaCopyArchived(job, now()),
    retentionDays: job.retentionDays || 0,
    expiresAt: job.expiresAt || null,
    deleting: !!job.deleting,
    removed: job.removed || 0,
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
  const target = (data, user, project, folderId) => {
    access(data, user, project, true);
    return assertFileFolder(
      data.projects.find(item => item.id === project),
      folderId,
    );
  };
  const capacity = async bytes => {
    let status;
    try {
      status = await storage.getStatus?.();
    } catch {
      /* Unknown provider quota is shown explicitly. */
    }
    return uploadCapacity(bytes, status);
  };
  const assertCopyCapacity = (data, owner) => {
    const jobs = data._mediaBackups || [],
      active = jobs.filter(job => !mediaCopyArchived(job, now()));
    if (jobs.length >= MEDIA_COPY_RETAINED_LIMIT) throw Object.assign(Error('Remove an archived set.'), { statusCode: 429, code: 'MEDIA_COPY_RETAINED_LIMIT' });
    if (active.length >= MEDIA_COPY_ACTIVE_WORKSPACE_LIMIT || active.filter(job => job.owner === owner).length >= MEDIA_COPY_ACTIVE_USER_LIMIT)
      throw Object.assign(Error('Media backup limit reached.'), { statusCode: 429, code: 'MEDIA_BACKUP_LIMIT' });
  };
  const recovery = createMediaManifestRecovery({
    load,
    write,
    storage,
    scope,
    resolveSource,
    access,
    target,
    capacity,
    owned,
    summary,
    assertCopyCapacity,
    now,
  });
  return {
    reviewManifest: recovery.review,
    importManifest: recovery.import,
    async inventory(user, id) {
      const job = owned(await load(), user, id);
      return {
        id,
        label: job.label || '',
        createdAt: job.createdAt,
        entries: job.entries.map(entry => ({ name: entry.file.name, bytes: entry.file.bytes, copied: !!entry.copy, checksum: entry.copy?.checksum || null })),
      };
    },
    async restorePlan(user, id, project, folderId = null) {
      const data = await load(),
        job = owned(data, user, id);
      if (!job.ready) throw fail();
      folderId = target(data, user, project, folderId);
      const entries = job.entries.map((entry, index) => ({
        index,
        name: entry.file.name,
        bytes: entry.copy.bytes,
        checksum: entry.copy.checksum,
        registered: !!registeredMediaRestore(data, job, index, project, folderId, user),
      }));
      const bytes = entries.filter(entry => !entry.registered).reduce((sum, entry) => sum + entry.bytes, 0);
      return {
        jobId: job.id,
        createdAt: job.createdAt,
        project,
        folderId,
        entries,
        capacity: await capacity(bytes),
        reviewKey: mediaRestoreReviewKey(job, project, folderId),
      };
    },
    async list(user) {
      const data = await load();
      return (data._mediaBackups || [])
        .filter(job => {
          try {
            metadataJob(data, user, job.id);
            return true;
          } catch {
            return false;
          }
        })
        .map(job => {
          let available = true;
          try {
            owned(data, user, job.id);
          } catch {
            available = false;
          }
          return { ...summary(job), available, mine: job.owner === user.id };
        });
    },
    async settings(user, id, input) {
      return summary(
        await write(data => {
          const job = metadataJob(data, user, id, true);
          if (job.deleting || job.lease?.until > now()) throw Object.assign(Error('Backup is busy.'), { code: 'MEDIA_BACKUP_BUSY', statusCode: 409 });
          const wasArchived = mediaCopyArchived(job, now());
          if (input.archived === false && mediaCopyArchived(job, now())) {
            const active = data._mediaBackups.filter(other => !mediaCopyArchived(other, now()));
            if (active.length >= MEDIA_COPY_ACTIVE_WORKSPACE_LIMIT || active.filter(other => other.owner === job.owner).length >= MEDIA_COPY_ACTIVE_USER_LIMIT)
              throw Object.assign(Error('Active copy limit reached.'), { code: 'MEDIA_BACKUP_LIMIT', statusCode: 429 });
            job.archived = false;
            job.expiresAt = null;
            job.retentionDays = 0;
          }
          if (input.archived === true) job.archived = true;
          if (input.label !== undefined || input.retentionDays !== undefined)
            Object.assign(job, mediaCopySettings({ label: input.label ?? job.label, retentionDays: input.retentionDays ?? job.retentionDays }, now()));
          if (wasArchived && input.archived !== false) job.archived = true;
          return job;
        }),
      );
    },
    async purge(user, id, index, confirmation) {
      if (confirmation !== id || !Number.isInteger(index) || index < 0) throw fail();
      const lease = randomUUID();
      const job = await write(data => {
        const job = metadataJob(data, user, id, true);
        if (!mediaCopyArchived(job, now()) || index > job.entries.length || index > (job.removed || 0)) throw fail();
        if (job.lease?.until > now()) throw Object.assign(Error('Backup is busy.'), { code: 'MEDIA_BACKUP_BUSY', statusCode: 409 });
        job.deleting = true;
        job.lease = { id: lease, until: now() + 120000 };
        return job;
      });
      try {
        // Storage verifies backup-directory membership and deterministic names.
        await storage.removeMediaBackupPart(job, index);
        return await write(data => {
          const current = metadataJob(data, user, id);
          if (current.lease?.id !== lease) throw fail();
          current.lease = null;
          current.removed = Math.max(current.removed || 0, index + 1);
          if (index === current.entries.length) data._mediaBackups = data._mediaBackups.filter(item => item.id !== id);
          return { deleted: index === current.entries.length, removed: current.removed };
        });
      } catch (error) {
        await write(data => {
          const current = metadataJob(data, user, id);
          if (current.lease?.id === lease) current.lease = null;
          return current;
        }).catch(() => {});
        throw error;
      }
    },
    async create(user, ids, input = {}) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw fail();
      return summary(
        await write(data => {
          data._mediaBackups ||= [];
          assertCopyCapacity(data, user.id);
          const entries = ids.map(id => {
            const file = data.files.find(item => item.id === id);
            if (!file?.storageName || !Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw fail();
            access(data, user, file.project);
            return { file: structuredClone(file) };
          });
          const job = {
            id: randomUUID(),
            owner: user.id,
            createdAt: now(),
            scope,
            creatorRole: workspaceMemberRole(memberForProfile(data, user)),
            entries,
            ready: false,
            ...mediaCopySettings(
              { label: input.label || `File copy ${new Date(now()).toISOString().slice(0, 10)}`, retentionDays: input.retentionDays },
              now(),
            ),
          };
          data._mediaBackups.push(job);
          return job;
        }),
      );
    },
    async advance(user, id) {
      const lease = randomUUID();
      const job = await write(data => {
        const job = owned(data, user, id);
        if (job.importProject) target(data, user, job.importProject, job.preferredFolder);
        if (job.ready) return job;
        if (mediaCopyArchived(job, now()))
          throw Object.assign(Error('Restore the archived set before continuing.'), { code: 'MEDIA_COPY_ARCHIVED', statusCode: 409 });
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
          const source = job.importSource && (await recovery.source(user, job.importSource.scope, job.importSource.id, job.importSource.digest));
          if (
            !source &&
            (!current ||
              current.storageFileId !== entry.file.storageFileId ||
              current.storageName !== entry.file.storageName ||
              current.bytes !== entry.file.bytes)
          )
            throw fail();
          if (source && (await capacity(source.manifest.entries[index].copy.bytes)).sufficient === false && job.importSource.scope !== scope)
            throw Object.assign(Error('Not enough storage.'), { code: 'MEDIA_RESTORE_QUOTA', statusCode: 507 });
          const copy = await storage.copyMediaObject(
            source ? source.manifest.entries[index].copy : entry.file,
            `media-${id}-${index}`,
            source ? { fromBackup: true, sourceStorage: source.storage } : undefined,
          );
          if (source) await recovery.source(user, job.importSource.scope, job.importSource.id, job.importSource.digest);
          await write(data => {
            const active = owned(data, user, id);
            if (active.importProject) target(data, user, active.importProject, active.preferredFolder);
            if (active.lease?.id !== lease || active.lease.until <= now()) throw fail();
            const file = data.files.find(file => file.id === entry.file.id);
            if (
              !source &&
              (!file || file.storageFileId !== entry.file.storageFileId || file.storageName !== entry.file.storageName || file.bytes !== entry.file.bytes)
            )
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
              if (active.importProject) target(data, user, active.importProject, active.preferredFolder);
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
    async restore(user, id, project, index, { folderId = null, reviewKey } = {}) {
      const before = await load(),
        job = owned(before, user, id);
      folderId = target(before, user, project, folderId);
      if (!job.ready || !Number.isInteger(index) || !job.entries[index]?.copy) throw fail();
      if (reviewKey && reviewKey !== mediaRestoreReviewKey(job, project, folderId))
        throw Object.assign(Error('Review the changed restore plan.'), { code: 'MEDIA_RESTORE_REVIEW_CHANGED', statusCode: 409 });
      const registered = registeredMediaRestore(before, job, index, project, folderId, user);
      if (registered) return registered;
      const entry = job.entries[index],
        ref = mediaRestoreRef(id, index, project, folderId);
      if ((await capacity(entry.copy.bytes)).sufficient === false)
        throw Object.assign(Error('Not enough Drive space.'), { code: 'MEDIA_RESTORE_QUOTA', statusCode: 507 });
      const latest = await load();
      owned(latest, user, id);
      target(latest, user, project, folderId);
      const copy = await storage.copyMediaObject(entry.copy, mediaRestoreName(id, index, project, folderId), {
        fromBackup: true,
        toBackup: false,
      });
      return write(data => {
        const activeJob = owned(data, user, id);
        const by = access(data, user, project, true);
        target(data, user, project, folderId);
        // The public file payload may contain a client-supplied reference. Reuse
        // only a record that also points at the verified restore object.
        const existing = data.files.find(
          file =>
            file.mediaBackupRef === ref &&
            file.project === project &&
            (file.folderId || null) === folderId &&
            file.ownerId === user.id &&
            file.storageFileId === copy.storageFileId &&
            file.storageName === copy.storageName &&
            file.bytes === copy.bytes,
        );
        const file = existing || {
          ...entry.file,
          ...copy,
          id: `file-${randomUUID()}`,
          project,
          task: null,
          folderId,
          at: now(),
          by,
          ownerId: user.id,
          mediaBackupRef: ref,
          size: formatFileSize(copy.bytes),
        };
        if (!existing) {
          data.files.unshift(file);
          registerFileMetadata(data, file, true);
        }
        activeJob.restores ||= {};
        activeJob.restores[ref] = {
          fileId: file.id,
          storageFileId: copy.storageFileId,
          storageName: copy.storageName,
          bytes: copy.bytes,
          checksum: copy.checksum,
          at: now(),
          ownerId: file.ownerId,
        };
        return file;
      });
    },
  };
}
