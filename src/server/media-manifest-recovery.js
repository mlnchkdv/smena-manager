import { createHash, randomUUID } from 'node:crypto';
import { mediaManifestIdentity } from '../shared/media-manifest.js';
import { memberForProfile } from '../shared/member-identity.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { mediaCopySettings } from '../shared/media-copy-lifecycle.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => Object.assign(Error('Verified manifest or source access is unavailable.'), { code: 'MEDIA_MANIFEST_UNAVAILABLE', statusCode: 403 });

export function createMediaManifestRecovery({ load, write, storage, scope, resolveSource, access, target, capacity, owned, summary, assertCopyCapacity, now }) {
  async function source(user, sourceScope, id, digest) {
    const context = resolveSource ? await resolveSource(sourceScope) : sourceScope === scope ? { storage, data: await load() } : null;
    if (!context?.storage?.readMediaManifest) throw unavailable();
    let manifest;
    try {
      manifest = await context.storage.readMediaManifest(id);
    } catch {
      throw unavailable();
    }
    if (hash(mediaManifestIdentity(manifest)) !== digest || (manifest.scope && manifest.scope !== sourceScope)) throw unavailable();
    // ACL comes from the current source workspace, never the uploaded JSON or
    // the destination session's role. Missing-core recovery requires a trusted
    // server manifest made by its owner while that owner was an administrator.
    const ownerRecovery = manifest.owner === user.id && manifest.creatorRole === 'admin';
    if (context.data) {
      const member = memberForProfile(context.data, user);
      if (!member || ['removed', 'deactivated'].includes(member.status) || (manifest.owner !== user.id && workspaceMemberRole(member) !== 'admin'))
        throw unavailable();
      for (const entry of manifest.entries) {
        if (context.data.projects?.some(project => project.id === entry.file.project)) access(context.data, user, entry.file.project);
        else if (!ownerRecovery || workspaceMemberRole(member) !== 'admin') throw unavailable();
      }
      if (context.data._mediaBackups?.some(job => job.id === id && job.deleting)) throw unavailable();
    } else if (!ownerRecovery) throw unavailable();
    return { ...context, manifest };
  }
  async function plan(user, uploaded, sourceScope, project, folderId) {
    const identity = mediaManifestIdentity(uploaded),
      digest = hash(identity);
    const verified = await source(user, sourceScope, identity.id, digest);
    const data = await load();
    folderId = target(data, user, project, folderId);
    const existing = sourceScope === scope && data._mediaBackups?.find(job => job.id === identity.id);
    if (existing) owned(data, user, existing.id);
    const mode = existing ? 'existing' : sourceScope === scope ? 'rebind' : 'copy';
    const available = [];
    // Bound concurrency and inspect actual objects, not just manifest claims.
    for (let i = 0; i < verified.manifest.entries.length; i += 4) {
      available.push(
        ...(await Promise.all(
          verified.manifest.entries.slice(i, i + 4).map(async entry => {
            try {
              await verified.storage.verifyMediaBackupObject(entry.copy);
              return true;
            } catch {
              return false;
            }
          }),
        )),
      );
    }
    return {
      ...verified,
      digest,
      folderId,
      mode,
      existing,
      available,
      sourceScope,
      project,
      capacity: await capacity(mode === 'copy' ? identity.entries.reduce((sum, entry) => sum + entry[5], 0) : 0),
      reviewKey: hash([sourceScope, digest, project, folderId, mode]),
    };
  }
  return {
    source,
    async review(user, uploaded, sourceScope, project, folderId) {
      const p = await plan(user, uploaded, sourceScope, project, folderId);
      return {
        sourceScope,
        project,
        folderId: p.folderId,
        mode: p.mode,
        capacity: p.capacity,
        reviewKey: p.reviewKey,
        available: p.available.every(Boolean),
        entries: p.manifest.entries.map((entry, index) => ({
          name: entry.file.name,
          bytes: entry.copy.bytes,
          checksum: entry.copy.checksum,
          available: p.available[index],
        })),
      };
    },
    async import(user, uploaded, sourceScope, project, folderId, reviewKey) {
      const p = await plan(user, uploaded, sourceScope, project, folderId);
      if (p.reviewKey !== reviewKey) throw Object.assign(Error('Review the changed import plan.'), { code: 'MEDIA_RESTORE_REVIEW_CHANGED', statusCode: 409 });
      if (!p.available.every(Boolean)) throw unavailable();
      if (p.capacity.sufficient === false) throw Object.assign(Error('Not enough storage.'), { code: 'MEDIA_RESTORE_QUOTA', statusCode: 507 });
      return summary(
        await write(data => {
          target(data, user, project, p.folderId);
          if (p.existing) return owned(data, user, p.existing.id);
          if (p.mode === 'rebind' && data._mediaBackups?.some(job => job.id === p.manifest.id))
            throw Object.assign(Error('Review the changed import plan.'), { code: 'MEDIA_RESTORE_REVIEW_CHANGED', statusCode: 409 });
          const duplicate = data._mediaBackups?.find(
            job => job.owner === user.id && job.importSource?.scope === sourceScope && job.importSource.digest === p.digest && job.importProject === project,
          );
          if (duplicate) return owned(data, user, duplicate.id);
          assertCopyCapacity(data, user.id);
          const job = {
            id: p.mode === 'rebind' ? p.manifest.id : randomUUID(),
            owner: user.id,
            createdAt: now(),
            scope,
            creatorRole: workspaceMemberRole(memberForProfile(data, user)),
            ready: false,
            ...mediaCopySettings({ label: p.manifest.label || 'Imported file copy', retentionDays: 0 }, now()),
            importProject: project,
            preferredFolder: p.folderId,
            importSource: { scope: sourceScope, id: p.manifest.id, digest: p.digest },
            entries: p.manifest.entries.map(entry => ({ file: { ...entry.file, project, folderId: null, task: null } })),
          };
          data._mediaBackups ||= [];
          data._mediaBackups.push(job);
          return job;
        }),
      );
    },
  };
}
