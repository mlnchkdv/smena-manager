import { createHash } from 'node:crypto';
import { getWorkspaceDatabase, mutateWorkspaceMetadata } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { workspaceScope } from './workspace-context.js';
import { knowledgeActor } from './knowledge-access.js';
import { projectAccess } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { validateResearchRecord } from './research-validation.js';
import {
  RESEARCH_LIMITS,
  researchError,
  researchUuid,
  researchJson,
  researchRef,
  validateResearchDraft,
  validateResearchTransition,
} from '../shared/research.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const fields = ['revision', 'members', 'projects', '_researchProjects'];
export function researchContext(data, projectId, profile, profiles = [], write = false) {
  const actor = knowledgeActor(data, profile, profiles, { write }),
    project = data.projects.find(item => item.id === projectId);
  const access = projectAccess(project, actor.id, workspaceMemberRole(actor));
  if (!access) throw researchError('RESEARCH_PROJECT_NOT_FOUND', 404);
  if (write && (project.archived || access < 3)) throw researchError('RESEARCH_FORBIDDEN', 403);
  return { actor, project, access };
}
export function createResearchStore({
  load = () => getWorkspaceDatabase({ fields }),
  mutate = (fn, revision) => mutateWorkspaceMetadata(fn, revision, { role: 'admin', scope: 'research' }),
  storage = getStorageProvider,
  scope = workspaceScope,
} = {}) {
  async function readObject(ref, projectId) {
    if (!researchRef(ref)) throw researchError('RESEARCH_INTEGRITY', 503);
    let text;
    try {
      text = await storage().readResearchObject(ref.sha256);
    } catch {
      throw researchError('RESEARCH_INTEGRITY', 503);
    }
    if (typeof text !== 'string' || Buffer.byteLength(text) !== ref.bytes || hash(text) !== ref.sha256) throw researchError('RESEARCH_INTEGRITY', 503);
    const value = JSON.parse(text);
    if (value.workspaceId !== scope() || value.projectId !== projectId) throw researchError('RESEARCH_INTEGRITY', 503);
    return value;
  }
  async function writeObject(value, limit = RESEARCH_LIMITS.objectBytes) {
    const text = researchJson(value),
      bytes = Buffer.byteLength(text),
      sha256 = hash(text);
    if (bytes > limit) throw researchError('RESEARCH_LIMIT', 413);
    await storage().writeResearchObject(text, sha256);
    return { kind: 'smena-research-object-v1', sha256, bytes };
  }
  async function index(data, projectId) {
    const ref = data._researchProjects?.[projectId];
    if (!ref) return { kind: 'smena-research-index-v1', workspaceId: scope(), projectId, enabled: false, revision: 0, records: [], operations: {} };
    const value = await readObject(ref, projectId);
    if (value.kind !== 'smena-research-index-v1' || !Array.isArray(value.records) || !value.operations) throw researchError('RESEARCH_INTEGRITY', 503);
    return value;
  }
  function summary(record, ref) {
    return {
      id: record.id,
      kind: record.kind,
      title: record.title,
      state: record.data.state || '',
      experimentId: record.data.experimentId || '',
      ownerId: record.data.ownerId || record.createdBy,
      archived: record.archived,
      reviewStatus: record.review?.status || 'draft',
      revision: record.revision,
      updatedAt: record.updatedAt,
      ref,
    };
  }
  async function read(projectId, profile, profiles = [], { id, query = '', kind, archived = false, offset = 0, limit = 50 } = {}) {
    const db = await load(),
      context = researchContext(db, projectId, profile, profiles),
      book = await index(db, projectId);
    let record;
    if (id) {
      const row = book.records.find(row => row.id === id);
      if (!row) throw researchError('RESEARCH_NOT_FOUND', 404);
      record = await readObject(row.ref, projectId);
      if (record.id !== row.id || record.kind !== row.kind) throw researchError('RESEARCH_INTEGRITY', 503);
    }
    researchContext(await load(), projectId, profile, profiles);
    const filtered = book.records
      .filter(
        row =>
          !!row.archived === !!archived &&
          (!kind || kind.split(',').includes(row.kind)) &&
          (!query || row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      projectId,
      enabled: book.enabled,
      revision: book.revision,
      actorId: context.actor.id,
      canEdit: !context.project.archived && context.access >= 3,
      canConfigure: !context.project.archived && context.access >= 4,
      total: filtered.length,
      items: filtered.slice(offset, offset + Math.min(100, limit)).map(row => {
        const item = { ...row };
        delete item.ref;
        return item;
      }),
      ...(record ? { record } : {}),
    };
  }
  async function command(projectId, input, profile, profiles = []) {
    if (!input || !researchUuid(input.operationId) || !['enable', 'create', 'update', 'archive', 'restore', 'review'].includes(input.action))
      throw researchError();
    const payloadHash = hash(researchJson(input)),
      operationKey = profile.id + ':' + input.operationId;
    for (let attempt = 0; attempt < 4; attempt++) {
      const baseline = await load();
      researchContext(baseline, projectId, profile, profiles, true);
      let result;
      try {
        await mutate(async data => {
          const context = researchContext(data, projectId, profile, profiles, true),
            book = await index(data, projectId),
            prior = book.operations[operationKey];
          if (prior) {
            if (prior.payloadHash !== payloadHash) throw researchError('RESEARCH_OPERATION_CONFLICT', 409);
            const record = prior.ref ? await readObject(prior.ref, projectId) : null;
            throw Object.assign(researchError('RESEARCH_REPLAY', 200), { result: { ...prior, record, replayed: true } });
          }
          if (Object.keys(book.operations).length >= RESEARCH_LIMITS.operations) throw researchError('RESEARCH_LIMIT', 413);
          const now = new Date().toISOString();
          let ref, record;
          if (input.action === 'enable') {
            if (context.access < 4 || typeof input.enabled !== 'boolean') throw researchError('RESEARCH_FORBIDDEN', 403);
            book.enabled = input.enabled;
          } else {
            if (!book.enabled) throw researchError('RESEARCH_DISABLED', 409);
            const current = book.records.find(row => row.id === input.id);
            const before = current ? await readObject(current.ref, projectId) : null;
            if (input.action === 'create') {
              if (book.records.length >= RESEARCH_LIMITS.records || !researchUuid(input.id) || before) throw researchError('RESEARCH_ID_CONFLICT', 409);
              const draft = validateResearchDraft(input.record);
              record = {
                ...draft,
                id: input.id,
                workspaceId: scope(),
                projectId,
                revision: 1,
                createdAt: now,
                createdBy: context.actor.id,
                updatedAt: now,
                updatedBy: context.actor.id,
                archived: false,
                review: { status: 'draft' },
                previous: null,
              };
            } else {
              if (!before) throw researchError('RESEARCH_NOT_FOUND', 404);
              if (input.expectedRevision !== before.revision) throw researchError('RESEARCH_STALE', 409);
              record = { ...before, revision: before.revision + 1, updatedAt: now, updatedBy: context.actor.id, previous: current.ref };
              if (input.action === 'update') {
                const draft = validateResearchDraft(input.record);
                if (draft.kind !== before.kind) throw researchError();
                validateResearchTransition(before, draft);
                Object.assign(record, draft, { review: { status: 'draft' } });
              } else if (input.action === 'review') {
                if (context.access < 4 && before.data.reviewerId !== context.actor.id) throw researchError('RESEARCH_REVIEW_FORBIDDEN', 403);
                if (before.createdBy === context.actor.id) throw researchError('RESEARCH_SELF_REVIEW', 409);
                record.review = { status: 'reviewed', by: context.actor.id, at: now, sourceHash: current.ref.sha256 };
              } else record.archived = input.action === 'archive';
            }
            if (['create', 'update'].includes(input.action)) await validateResearchRecord({ record, before, book, database: data, context, readObject });
            ref = await writeObject(record);
            const row = summary(record, ref);
            book.records = current ? book.records.map(item => (item.id === row.id ? row : item)) : [...book.records, row];
          }
          book.revision++;
          result = {
            operationId: input.operationId,
            payloadHash,
            id: record?.id || null,
            revision: record?.revision || book.revision,
            ref: ref || null,
            at: now,
            actorId: context.actor.id,
          };
          book.operations[operationKey] = result;
          const nextRef = await writeObject(book, RESEARCH_LIMITS.indexBytes);
          data._researchProjects = { ...data._researchProjects, [projectId]: nextRef };
          result = { ...result, record: record || null, replayed: false };
          return data;
        }, baseline.revision);
        return result;
      } catch (error) {
        if (error.code === 'RESEARCH_REPLAY') return error.result;
        if (error.code !== 'REVISION_CONFLICT' || attempt === 3) throw error;
      }
    }
  }
  async function history(projectId, id, profile, profiles = [], cursor) {
    const current = await read(projectId, profile, profiles, { id });
    let ref = current.record.previous;
    if (cursor) {
      // A cursor is a hash in this record's chain, never an arbitrary object locator.
      let scanned = 0;
      while (ref && ref.sha256 !== cursor && scanned++ < 1000) ref = (await readObject(ref, projectId)).previous;
      if (!ref || ref.sha256 !== cursor) throw researchError('RESEARCH_CURSOR_INVALID');
    }
    const items = [];
    while (ref && items.length < 10) {
      const record = await readObject(ref, projectId);
      if (record.id !== id) throw researchError('RESEARCH_INTEGRITY', 503);
      items.push({ revision: record.revision, at: record.updatedAt, by: record.updatedBy, title: record.title, record });
      ref = record.previous;
    }
    researchContext(await load(), projectId, profile, profiles);
    return { items, nextCursor: ref?.sha256 || null };
  }
  return { read, command, history };
}
export const researchStore = createResearchStore();
