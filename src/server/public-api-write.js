import { randomUUID } from 'node:crypto';
import { withIntegrationOperation } from './integration-operation-lock.js';
import { getWorkspaceDatabase, mutateWorkspaceMetadata, getWorkspaceFileSnapshot } from './workspace-store.js';
import { memberForProfile } from '../shared/member-identity.js';
import { canReadProject } from '../shared/project-access.js';
import { currentCatalogUser } from './file-catalog-query.js';
import { integrationRegistry, integrationError } from './integration-registry.js';
import { requireIntegrationScope } from './public-api-auth.js';
import { knowledgeActor } from './knowledge-access.js';
import { applyKnowledgeNoteCreate, applyKnowledgeNotePatch } from './knowledge-note-store.js';
import { knowledgeEntityEtag, knowledgeEntityVersion } from './knowledge-entity-version.js';
import { apiDigest, apiNoteUrl } from './public-api-utils.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { INTEGRATION_LIMITS } from '../shared/integration-contract.js';

const fields = {
  title: 'title',
  summary: 'summary',
  folder_id: 'folderId',
  tags: 'tags',
  aliases: 'aliases',
  type_id: 'typeId',
  properties: 'properties',
  content_markdown: 'formatted_markdown',
};
export function validateApiNoteInput(input, kind) {
  const allowed =
    kind === 'create'
      ? Object.keys(fields).concat('content_format')
      : kind === 'content'
        ? ['content_markdown', 'content_format']
        : ['title', 'summary', 'tags', 'aliases', 'type_id', 'properties'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length || Object.keys(input).some(key => !allowed.includes(key)))
    throw integrationError('INVALID_NOTE_FIELDS');
  if (input.content_format !== undefined && input.content_format !== 'markdown') throw integrationError('UNSUPPORTED_NOTE_FORMAT');
  if ((kind === 'create' || input.title !== undefined) && (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500))
    throw integrationError('INVALID_NOTE_TITLE');
  if ((kind === 'create' || kind === 'content') && typeof input.content_markdown !== 'string') throw integrationError('INVALID_NOTE_CONTENT');
  if (
    input.content_markdown !== undefined &&
    (typeof input.content_markdown !== 'string' || Buffer.byteLength(input.content_markdown) > INTEGRATION_LIMITS.markdownBytes)
  )
    throw integrationError('NOTE_CONTENT_TOO_LARGE', 413);
  for (const name of ['summary', 'type_id'])
    if (input[name] !== undefined && (typeof input[name] !== 'string' || input[name].length > (name === 'summary' ? 10000 : 100)))
      throw integrationError('INVALID_NOTE_FIELDS');
  if (input.folder_id !== undefined && input.folder_id !== null && (typeof input.folder_id !== 'string' || !input.folder_id || input.folder_id.length > 180))
    throw integrationError('INVALID_NOTE_FOLDER');
  for (const name of ['tags', 'aliases'])
    if (
      input[name] !== undefined &&
      (!Array.isArray(input[name]) || input[name].length > 100 || input[name].some(value => typeof value !== 'string' || value.length > 180))
    )
      throw integrationError('INVALID_NOTE_FIELDS');
  if (input.properties !== undefined && (!input.properties || typeof input.properties !== 'object' || Array.isArray(input.properties)))
    throw integrationError('INVALID_NOTE_PROPERTIES');
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([name]) => Object.hasOwn(input, name))
      .map(([name, key]) => [key, structuredClone(input[name])]),
  );
}
function validateType(data, note) {
  const type = noteTypes(data.ws).find(item => item.id === (note.typeId || 'note'));
  if (!type) throw integrationError('INVALID_NOTE_TYPE');
  const properties = note.properties || {};
  if (Object.keys(properties).length > 20) throw integrationError('INVALID_NOTE_PROPERTIES');
  for (const [key, value] of Object.entries(properties)) {
    const field = type.fields.find(field => field.id === key);
    if (
      !field ||
      (field.kind === 'number'
        ? typeof value !== 'number' || !Number.isFinite(value)
        : field.kind === 'checkbox'
          ? typeof value !== 'boolean'
          : typeof value !== 'string' || value.length > 2000)
    )
      throw integrationError('INVALID_NOTE_PROPERTIES');
    if (field.kind === 'date' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))))
      throw integrationError('INVALID_NOTE_PROPERTIES');
  }
}
export function integrationOperationKey(integration, key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw integrationError('IDEMPOTENCY_KEY_REQUIRED', 428);
  return apiDigest([integration.id, integration.workspaceId, key]);
}
function receiptResult(data, noteId, text, workspaceId) {
  const note = data.knowledgeNotes.find(note => note.id === noteId);
  return {
    id: note.id,
    workspace_id: workspaceId,
    version: knowledgeEntityVersion(note).number,
    etag: knowledgeEntityEtag(note),
    content_sha256: apiDigest(text),
    url: apiNoteUrl(data.ws, note.id),
  };
}
export async function performIntegrationNoteWrite(request, kind, patch) {
  const key = integrationOperationKey(request.integration, request.get('Idempotency-Key'));
  return withIntegrationOperation(key, () => performNoteWrite(request, kind, patch, key));
}
async function performNoteWrite(request, kind, patch, key) {
  const etag = request.get('If-Match');
  if (kind !== 'create' && !etag) throw integrationError('PRECONDITION_REQUIRED', 428);
  const digest = apiDigest([kind, request.params.id || null, patch, etag || null]);
  const noteId = kind === 'create' ? 'kn' + randomUUID() : request.params.id;
  const createdAt = Date.now();
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    const baseline = await getWorkspaceDatabase({ fields: ['revision'] });
    try {
      await mutateWorkspaceMetadata(
        async data => {
          const integration = await integrationRegistry.verify(request.integrationToken);
          if (integration.fileOperationKeys.includes(key)) throw integrationError('IDEMPOTENCY_KEY_REUSED', 409);
          if (
            !integration.scopes.includes('knowledge:read') ||
            !integration.scopes.includes('knowledge:write') ||
            !integration.policy.writeEnabled ||
            process.env.SMENA_PUBLIC_API_WRITE_ENABLED === 'false'
          )
            throw integrationError('INTEGRATION_SCOPE_FORBIDDEN', 403);
          const actor = knowledgeActor(data, request.user, [], { write: true });
          const existing = (data._integrationOperations || []).find(item => item.key === key && item.expiresAt > Date.now());
          if (existing) {
            if (existing.digest !== digest) throw integrationError('IDEMPOTENCY_KEY_REUSED', 409);
            throw Object.assign(new Error('Replay'), { code: 'INTEGRATION_REPLAY', result: existing.result, status: existing.status });
          }
          data._integrationOperations = (data._integrationOperations || []).filter(item => item.expiresAt > Date.now());
          if (data._integrationOperations.length >= INTEGRATION_LIMITS.receipts) throw integrationError('INTEGRATION_OPERATION_LIMIT', 429);
          let changed;
          if (kind === 'create') {
            validateType(data, patch);
            changed = {
              note: await applyKnowledgeNoteCreate(data, { ...patch, id: noteId, updatedVia: { id: integration.id, name: integration.name } }, actor),
            };
          } else {
            const before = data.knowledgeNotes.find(note => note.id === noteId);
            if (!before) throw integrationError('API_NOT_FOUND', 404);
            let effectivePatch = patch;
            if (kind === 'attachment') {
              if (!integration.scopes.includes('files:read') || !integration.policy.uploadsEnabled) throw integrationError('INTEGRATION_SCOPE_FORBIDDEN', 403);
              const snapshot = await getWorkspaceFileSnapshot(request.user, patch.attachmentFileId);
              const user = currentCatalogUser(snapshot, request.user),
                member = memberForProfile(snapshot, user);
              const file = snapshot.files?.find(item => item.id === patch.attachmentFileId);
              if (
                !member ||
                !file ||
                !canReadProject(
                  snapshot.projects.find(project => project.id === file.project),
                  member.id,
                  user.role,
                )
              )
                throw integrationError('API_NOT_FOUND', 404);
              effectivePatch = { assets: { ...(before.assets || {}), ['attachment/' + file.id]: file.id } };
            }
            validateType(data, { ...before, ...effectivePatch });
            changed = await applyKnowledgeNotePatch(data, noteId, effectivePatch, actor, { etag, integration });
          }
          request.integrationWriteText = changed.note.formatted_markdown || '';
          request.integrationWriteActor = actor.id;
          request.integrationWriteUnchanged = !!changed.unchanged;
          return data;
        },
        baseline.revision,
        {
          role: 'admin',
          scope: 'knowledgeApi',
          finalize: data => {
            result = receiptResult(data, noteId, request.integrationWriteText, request.integration.workspaceId);
            data._integrationOperations.push({
              key,
              digest,
              integrationId: request.integration.id,
              at: createdAt,
              expiresAt: createdAt + INTEGRATION_LIMITS.receiptTtlMs,
              status: kind === 'create' ? 201 : 200,
              result,
            });
            data._integrationAudit = [
              {
                requestId: request.requestId,
                integrationId: request.integration.id,
                integrationName: request.integration.name,
                actorId: request.integrationWriteActor,
                noteId,
                kind,
                at: new Date(createdAt).toISOString(),
                version: result.version,
                unchanged: request.integrationWriteUnchanged,
              },
              ...(data._integrationAudit || []),
            ].slice(0, INTEGRATION_LIMITS.auditEvents);
          },
        },
      );
      return { result, status: kind === 'create' ? 201 : 200, replayed: false };
    } catch (error) {
      if (error.code === 'INTEGRATION_REPLAY') return { result: error.result, status: error.status, replayed: true };
      if (error.code !== 'REVISION_CONFLICT' || attempt === 2) throw error;
    } finally {
      delete request.integrationWriteText;
    }
  }
}
export function registerPublicApiWrites(router) {
  const read = requireIntegrationScope('knowledge:read'),
    write = requireIntegrationScope('knowledge:write');
  for (const [method, path, kind] of [
    ['post', '/workspaces/:w/notes', 'create'],
    ['put', '/workspaces/:w/notes/:id/content', 'content'],
    ['patch', '/workspaces/:w/notes/:id/metadata', 'metadata'],
  ])
    router[method](path, read, write, async (req, res, next) => {
      try {
        const value = await performIntegrationNoteWrite(req, kind, validateApiNoteInput(req.body, kind));
        res.setHeader('ETag', value.result.etag);
        if (kind === 'create') res.setHeader('Location', value.result.url);
        if (value.replayed) res.setHeader('Idempotency-Replayed', 'true');
        res.status(value.status).json(value.result);
      } catch (error) {
        next(error);
      }
    });
  router.get('/workspaces/:w/operations/:operation_id', read, async (req, res, next) => {
    try {
      const data = await getWorkspaceDatabase({ fields: ['members', '_integrationOperations'] });
      knowledgeActor(data, req.user);
      const key = integrationOperationKey(req.integration, req.params.operation_id);
      const receipt = (data._integrationOperations || []).find(item => item.key === key && item.expiresAt > Date.now());
      if (!receipt) {
        const fileReceipt = await integrationRegistry.fileReceipt(req.integration, key);
        if (!fileReceipt) throw integrationError('OPERATION_NOT_FOUND', 404);
        const result = Object.fromEntries(
          ['id', 'upload_id', 'state'].filter(key => fileReceipt.result?.[key] !== undefined).map(key => [key, fileReceipt.result[key]]),
        );
        return res.json({ state: fileReceipt.result ? 'completed' : 'pending', result, expires_at: new Date(fileReceipt.expiresAt).toISOString() });
      }
      res.json({ state: 'completed', result: receipt.result, status: receipt.status, expires_at: new Date(receipt.expiresAt).toISOString() });
    } catch (error) {
      next(error);
    }
  });
}
