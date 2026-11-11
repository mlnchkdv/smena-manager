import { createHash, randomUUID } from 'node:crypto';
import { memberForProfile } from '../shared/member-identity.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import {
  beginKnowledgeReachability,
  appendKnowledgeBackup,
  stepKnowledgeReachability,
  previewKnowledgeMaintenance,
  publicKnowledgeMaintenancePreview,
} from './knowledge-reachability.js';
import { maintenanceJournal } from './storage/maintenance-journal.js';
import { inspectedKnowledgeKind } from './knowledge-inspection-formats.js';

const fingerprint = root => createHash('sha256').update(JSON.stringify(root)).digest('hex');
const scopes = ['body', 'version', 'search', 'metadata', 'backup'];
const active = ['backups', 'references', 'inventory', 'verification'];
const fail = (code, statusCode = 409) => Object.assign(new Error('Storage inspection could not continue. Review the current progress.'), { code, statusCode });
const workspace = root => root.ws?.id || root.ws?.url;
const reachableKey = object => (object.area === 'backup' ? `backup:${object.sha256}` : `live:${object.kind}:${object.sha256}`);

export function createKnowledgeInspection({
  storage,
  journal = maintenanceJournal(storage),
  loadRoot = () => storage.readDatabaseRoot({ knowledge: false }),
  now = Date.now,
}) {
  async function authorized(profile) {
    const root = await loadRoot(),
      actor = memberForProfile(root, profile);
    if (!root || !isActiveMember(actor) || workspaceMemberRole(actor) !== 'admin') throw fail('WORKSPACE_FORBIDDEN', 403);
    if (!workspace(root)) throw fail('INSPECTION_WORKSPACE_UNAVAILABLE', 503);
    return { root, actor };
  }
  function owned(record, root, id) {
    const job = record.payload;
    if (!job) return null;
    if (job.format !== 'smena-knowledge-inspection-job-v1' || job.workspace !== workspace(root)) throw fail('INSPECTION_WORKSPACE_UNAVAILABLE', 503);
    if (id && job.id !== id) throw fail('INSPECTION_CONFLICT');
    return job;
  }
  function plan(job, root) {
    const observations = {};
    for (const object of job.inventory) {
      const key = `${object.area}:${object.id}`,
        old = job.priorObservations?.[key];
      if (old && old.sha256 === object.sha256) observations[key] = old.at;
    }
    return previewKnowledgeMaintenance(job.reachability, job.inventory, {
      inventoryComplete: job.phase === 'complete',
      currentRootFingerprint: fingerprint(root),
      now: now(),
      observations,
    });
  }
  function publicJob(job, root) {
    if (!job) return { job: null, deletionEnabled: false };
    const preview = plan(job, root);
    return {
      deletionEnabled: false,
      job: {
        id: job.id,
        phase: preview.rootCurrent ? job.phase : 'stale',
        paused: job.paused,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        code: job.code || '',
        backups: job.backups,
        skippedBackups: job.skippedBackups,
        inspected: job.reachability.inspected,
        objects: job.inventory.length,
        verified: job.verifyIndex,
        bytes: job.inventory.reduce((sum, object) => sum + (Number.isSafeInteger(object.bytes) ? object.bytes : 0), 0),
        plan: publicKnowledgeMaintenancePreview(preview),
        candidates: preview.complete ? preview.candidates.map(object => ({ kind: object.kind, bytes: object.bytes, createdAt: object.createdAt })) : [],
      },
    };
  }
  async function checkpoint(job, record, profile) {
    // Recheck membership and root after any slow provider read. Never publish an
    // old administrator's result after demotion or another workspace's result.
    const { root } = await authorized(profile);
    if (fingerprint(root) !== job.reachability.rootFingerprint) {
      job.phase = 'stale';
      job.paused = true;
    }
    job.updatedAt = now();
    await journal.save(job, record.token);
    return publicJob(job, root);
  }
  async function advance(job) {
    const signal = AbortSignal.timeout(25000);
    if (job.phase === 'backups') {
      if (!job.snapshotWindow.length && !job.snapshotsDone) {
        const page = await storage.listKnowledgeObjectInventory({ scope: 'snapshot', cursor: job.snapshotCursor, limit: 25, signal });
        job.snapshotCursor = page.cursor;
        job.snapshotsDone = !page.cursor;
        job.snapshotWindow.push(...page.items);
      }
      const snapshot = job.snapshotWindow.shift();
      if (snapshot) {
        if (++job.backups > 2000) throw fail('INSPECTION_CAPACITY', 413);
        // Legacy expanded snapshots may be much larger than a bounded root.
        // Keep their unknown references conservative instead of loading them.
        if (!snapshot.owned || snapshot.bytes > 8 * 1024 * 1024) job.skippedBackups++;
        else {
          const read = await storage.readKnowledgeInventoryObject(snapshot, { signal });
          try {
            job.reachability = await appendKnowledgeBackup(job.reachability, JSON.parse(read.text));
          } catch (error) {
            if (error.code !== 'KNOWLEDGE_MAINTENANCE_FORMAT_UNSUPPORTED') throw error;
            job.skippedBackups++;
          }
        }
      } else if (job.snapshotsDone) {
        job.reachability.rootsComplete = !job.skippedBackups;
        job.phase = 'inventory';
      }
    } else if (job.phase === 'references') {
      if (job.reachability.pending.length)
        job.reachability = await stepKnowledgeReachability(job.reachability, async reference => {
          // Resolve only identities from the read-only inventory. Provider
          // convenience methods may bootstrap missing folders on Drive.
          const object = job.inventory.find(object => object.owned && reachableKey(object) === reachableKey(reference));
          if (!object) throw Object.assign(fail('INSPECTION_REFERENCE_MISSING', 503), { code: 'ENOENT' });
          if (object.bytes !== reference.bytes) throw fail('KNOWLEDGE_INVENTORY_INTEGRITY', 503);
          return (await storage.readKnowledgeInventoryObject(object, { signal })).text;
        });
      else job.phase = 'verification';
    } else if (job.phase === 'inventory') {
      const scope = scopes[job.scopeIndex];
      const page = await storage.listKnowledgeObjectInventory({ scope, cursor: job.inventoryCursor, limit: 100, signal });
      if (job.inventory.length + page.items.length > 10000) throw fail('INSPECTION_CAPACITY', 413);
      const ids = new Set(job.inventory.map(object => `${object.scope}:${object.id}`));
      if (page.items.some(object => ids.has(`${object.scope}:${object.id}`))) throw fail('KNOWLEDGE_INVENTORY_CHANGED', 503);
      job.inventory.push(...page.items);
      job.inventoryCursor = page.cursor;
      if (!page.cursor && ++job.scopeIndex === scopes.length) job.phase = 'references';
    } else if (job.phase === 'verification') {
      let budget = 100;
      while (job.verifyIndex < job.inventory.length && budget--) {
        const object = job.inventory[job.verifyIndex];
        const reference = job.reachability.reachable[reachableKey(object)];
        if (reference) {
          if (reference.bytes !== object.bytes) throw fail('KNOWLEDGE_INVENTORY_INTEGRITY', 503);
          object.kind = reference.kind;
          job.verifyIndex++;
        } else if (!object.owned) job.verifyIndex++;
        else {
          // At most one unreferenced body/version/index read per request.
          const verified = await storage.readKnowledgeInventoryObject(object, { signal }),
            value = JSON.parse(verified.text);
          let kind = inspectedKnowledgeKind(value);
          if (object.area === 'backup' && !kind && [3, 4].includes(value?.schemaVersion)) {
            try {
              await beginKnowledgeReachability({ root: value });
              kind = 'root';
            } catch {
              /* future/corrupt roots remain unknown */
            }
          }
          object.recognizedFormat = !!kind && (object.area === 'backup' || kind === object.kind);
          if (kind && object.area === 'backup') object.kind = kind;
          object.integrityChecked = verified.integrityChecked === true;
          job.verifyIndex++;
          break;
        }
      }
      if (job.verifyIndex === job.inventory.length) job.phase = 'complete';
    }
  }
  return {
    async read(profile) {
      await authorized(profile);
      const record = await journal.read(),
        { root } = await authorized(profile);
      return publicJob(owned(record, root), root);
    },
    async start(profile, replaceId = null) {
      const { root, actor } = await authorized(profile),
        record = await journal.read(),
        previous = owned(record, root);
      if (previous && previous.id !== replaceId) throw fail('INSPECTION_CONFLICT');
      const priorObservations = {};
      if (previous?.phase === 'complete') {
        const preview = plan(previous, root);
        if (preview.complete)
          for (const observation of preview.observations) {
            const object = previous.inventory.find(object => `${object.area}:${object.id}` === observation.key);
            priorObservations[observation.key] = { sha256: object.sha256, at: observation.firstUnreferencedAt };
          }
      }
      const job = {
        format: 'smena-knowledge-inspection-job-v1',
        id: randomUUID(),
        workspace: workspace(root),
        by: actor.id,
        phase: 'backups',
        paused: true,
        startedAt: now(),
        updatedAt: now(),
        backups: 0,
        skippedBackups: 0,
        reachability: await beginKnowledgeReachability({ root }),
        priorObservations,
        inventory: [],
        verifyIndex: 0,
        snapshotWindow: [],
        snapshotCursor: null,
        snapshotsDone: false,
        inventoryCursor: null,
        scopeIndex: 0,
      };
      return checkpoint(job, record, profile);
    },
    async control(profile, id, action) {
      const { root } = await authorized(profile),
        record = await journal.read(),
        before = owned(record, root, id);
      if (!before || !['pause', 'resume'].includes(action)) throw fail('INVALID_INSPECTION_COMMAND', 400);
      const job = structuredClone(before);
      if (action === 'resume' && job.phase === 'failed') {
        job.phase = job.resumePhase;
        job.code = '';
      }
      job.paused = action === 'pause';
      return checkpoint(job, record, profile);
    },
    async step(profile, id) {
      const { root } = await authorized(profile),
        record = await journal.read(),
        before = owned(record, root, id);
      if (!before) throw fail('INSPECTION_NOT_FOUND', 404);
      if (before.paused || !active.includes(before.phase)) {
        const fresh = await authorized(profile);
        return publicJob(owned(record, fresh.root, id), fresh.root);
      }
      let job = structuredClone(before);
      if (fingerprint(root) === job.reachability.rootFingerprint) {
        try {
          await advance(job);
        } catch (error) {
          job = {
            ...structuredClone(before),
            phase: 'failed',
            paused: true,
            resumePhase: before.phase,
            code: /^[A-Z_]{3,80}$/.test(error.code || '') ? error.code : 'INSPECTION_READ_FAILED',
          };
        }
      }
      return checkpoint(job, record, profile);
    },
  };
}
