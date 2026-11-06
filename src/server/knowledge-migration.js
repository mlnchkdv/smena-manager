import { createHash, randomUUID } from 'node:crypto';
import { getWorkspaceDatabase, mutateWorkspaceMetadata, createWorkspaceBackup } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { knowledgeActor } from './knowledge-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { externalKnowledgeBody, validKnowledgeBodyRef, KNOWLEDGE_BODY_MAX_BYTES } from '../shared/knowledge-body.js';
import { externalKnowledgeVersion } from '../shared/knowledge-history.js';
import { knowledgeBodyToken, knowledgeCatalogDocument } from './knowledge-catalog.js';
import { storeKnowledgeBody, loadKnowledgeBody } from './knowledge-body-store.js';
import { persistKnowledgeVersion } from './knowledge-version-blobs.js';
const fail = (code, statusCode = 409) => Object.assign(new Error('Review the current storage plan before continuing.'), { code, statusCode });
const admin = (data, profile, profiles) => {
  const actor = knowledgeActor(data, profile, profiles, { write: true });
  if (workspaceMemberRole(actor) !== 'admin') throw fail('ADMIN_REQUIRED', 403);
  return actor;
};
const needsMigration = note => !externalKnowledgeBody(note) || typeof note.bodyPreview !== 'string';
const candidates = data =>
  [
    ...(data.knowledgeNotes || []).filter(needsMigration).map(note => ({ key: 'note:' + note.id, note })),
    ...(data.trash || [])
      .filter(item => item.kind === 'note' && item.data?.note && needsMigration(item.data.note))
      .map(item => ({ key: 'trash:' + item.id, note: item.data.note, trashId: item.id })),
  ].sort((a, b) => a.key.localeCompare(b.key));
function plan(data, actor) {
  const pending = candidates(data),
    tooLarge = pending
      .filter(({ note }) =>
        externalKnowledgeBody(note)
          ? !validKnowledgeBodyRef(note.bodyRef)
          : note.bodyPending ||
            typeof (note.formatted_markdown ?? '') !== 'string' ||
            Buffer.byteLength(JSON.stringify({ format: 'smena-knowledge-body-v1', noteId: note.id, formatted_markdown: note.formatted_markdown ?? '' })) >
              KNOWLEDGE_BODY_MAX_BYTES,
      )
      .map(item => item.note.id);
  const reviewKey = createHash('sha256')
    .update(JSON.stringify([data.revision, actor.id, pending.map(item => [item.key, knowledgeBodyToken(item.note)])]))
    .digest('hex');
  return {
    revision: data.revision,
    reviewKey,
    remaining: pending.length,
    active: pending.filter(item => !item.trashId).length,
    trash: pending.filter(item => item.trashId).length,
    sourceBytes: pending.reduce(
      (sum, item) => sum + (externalKnowledgeBody(item.note) ? item.note.bodyRef.bytes || 0 : Buffer.byteLength(item.note.formatted_markdown || '')),
      0,
    ),
    catalogBytes: Buffer.byteLength(JSON.stringify(knowledgeCatalogDocument(data))),
    tooLarge,
    enabled: process.env.KNOWLEDGE_CATALOG_ENABLED === 'true',
    job: data._knowledgeMigration || null,
  };
}
export async function readKnowledgeMigration(profile, profiles = []) {
  const data = await getWorkspaceDatabase({
    fields: ['members', 'knowledgeNotes', 'knowledgeFolders', 'trash', 'revision', 'createdAt', '_documentRevisions', '_knowledgeMigration'],
  });
  return plan(data, admin(data, profile, profiles));
}
export async function startKnowledgeMigration(reviewKey, profile, profiles = []) {
  if (process.env.KNOWLEDGE_CATALOG_ENABLED !== 'true') throw fail('KNOWLEDGE_MIGRATION_DISABLED');
  const current = await getWorkspaceDatabase({ catalog: 'metadata' }),
    actor = admin(current, profile, profiles),
    review = plan(current, actor);
  if (reviewKey !== review.reviewKey || review.tooLarge.length || !review.remaining) throw fail('KNOWLEDGE_MIGRATION_REVIEW_STALE');
  if (['running', 'paused'].includes(review.job?.state)) throw fail('KNOWLEDGE_MIGRATION_EXISTS');
  const backup = await createWorkspaceBackup('Before knowledge body migration');
  if (!backup?.id) throw fail('KNOWLEDGE_MIGRATION_BACKUP_FAILED', 503);
  const saved = await mutateWorkspaceMetadata(
    data => {
      const member = admin(data, profile, profiles);
      if (plan(data, member).reviewKey !== reviewKey) throw fail('KNOWLEDGE_MIGRATION_REVIEW_STALE');
      data._knowledgeMigration = { id: randomUUID(), state: 'running', processed: 0, startedAt: new Date().toISOString(), by: member.id, backupId: backup.id };
      return data;
    },
    review.revision,
    { role: 'admin', scope: 'knowledgeMigration' },
  );
  return plan(saved, actor);
}
export async function stepKnowledgeMigration(jobId, profile, profiles = [], { pause = false } = {}) {
  if (process.env.KNOWLEDGE_CATALOG_ENABLED !== 'true') throw fail('KNOWLEDGE_MIGRATION_DISABLED');
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      const saved = await mutateWorkspaceMetadata(
        async data => {
          const actor = admin(data, profile, profiles),
            job = data._knowledgeMigration;
          if (!job || job.id !== jobId) throw fail('KNOWLEDGE_MIGRATION_REVIEW_STALE');
          if (job.state === 'complete') throw Object.assign(new Error('Complete'), { code: 'KNOWLEDGE_MIGRATION_UNCHANGED', result: plan(data, actor) });
          if (pause) {
            job.state = 'paused';
            return data;
          }
          const storage = getStorageProvider(),
            window = candidates(data).slice(0, 3);
          for (const item of window) {
            const note = await loadKnowledgeBody(storage, item.note);
            note.formatted_markdown ??= '';
            if (Array.isArray(note.history)) {
              const history = [];
              for (const version of note.history)
                history.push(externalKnowledgeVersion(version) ? version : await persistKnowledgeVersion(storage, note.id, version));
              note.history = history;
            }
            const stored = await storeKnowledgeBody(storage, note);
            if (item.trashId) data.trash.find(entry => entry.id === item.trashId).data.note = stored;
            else data.knowledgeNotes[data.knowledgeNotes.findIndex(entry => entry.id === note.id)] = stored;
          }
          job.processed += window.length;
          job.state = candidates(data).length ? 'running' : 'complete';
          job.updatedAt = new Date().toISOString();
          if (job.state === 'complete') {
            job.completedAt = job.updatedAt;
            data._knowledgeStorageVersion = 1;
          }
          if (window.length) {
            const meta = data._documentRevisions?.knowledge || {};
            data._documentRevisions = {
              ...data._documentRevisions,
              knowledge: { revision: Number(meta.revision || 0) + 1, createdAt: meta.createdAt || data.createdAt, updatedAt: job.updatedAt },
            };
          }
          return data;
        },
        base.revision,
        { role: 'admin', scope: 'knowledgeMigration' },
      );
      return plan(saved, admin(saved, profile, profiles));
    } catch (error) {
      if (error.code === 'KNOWLEDGE_MIGRATION_UNCHANGED') return error.result;
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    }
  }
}
