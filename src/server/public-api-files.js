import { randomUUID } from 'node:crypto';
import { requireIntegrationScope } from './public-api-auth.js';
import { integrationRegistry, integrationError } from './integration-registry.js';
import { integrationOperationKey, performIntegrationNoteWrite } from './public-api-write.js';
import { withIntegrationOperation } from './integration-operation-lock.js';
import { getWorkspaceDatabase, getWorkspaceFileSnapshot } from './workspace-store.js';
import { assertFileTarget, startResumableFileUpload, completeResumableFileUpload, streamFileContent } from './file-routes.js';
import { verifyUploadTicket, renewUploadTicket } from './upload-ticket.js';
import { getStorageProvider } from './storage/index.js';
import { validateFileUpload, getFileUploadPolicy } from './file-policy.js';
import { memberForProfile } from '../shared/member-identity.js';
import { canReadProject } from '../shared/project-access.js';
import { currentCatalogUser } from './file-catalog-query.js';
import { apiDigest } from './public-api-utils.js';

const fileDto = file => ({
  id: file.id,
  name: file.name,
  project_id: file.project,
  folder_id: file.folderId || null,
  size: Number(file.bytes || 0),
  mime_type: file.mimeType || 'application/octet-stream',
  sha256: file.sha256 || null,
});
const uploadDto = upload => ({
  upload_id: upload.id,
  state: upload.state,
  name: upload.metadata.name,
  size: upload.metadata.size,
  sha256: upload.metadata.sha256,
  ...(upload.file ? { file: upload.file } : {}),
});
async function target(request, upload) {
  const data = await getWorkspaceDatabase({ fields: ['projects', 'tasks', 'members'] });
  assertFileTarget(data, request.user, upload.metadata.project_id, null, upload.metadata.folder_id || null);
}
async function uploadFor(request, id) {
  return integrationRegistry.mutate(data => {
    const upload = (data.uploads || []).find(
      item =>
        item.id === id && item.integrationId === request.integration.id && item.workspaceId === request.integration.workspaceId && item.expiresAt > Date.now(),
    );
    if (!upload) throw integrationError('UPLOAD_NOT_FOUND', 404);
    return structuredClone(upload);
  });
}
async function privateFileOperation(request, kind, body, operation) {
  const key = integrationOperationKey(request.integration, request.get('Idempotency-Key'));
  const digest = apiDigest([kind, request.params.upload_id || null, body]);
  return withIntegrationOperation(key, async () => {
    const active = await integrationRegistry.verify(request.integrationToken);
    if (!active.policy.uploadsEnabled || !active.policy.writeEnabled || !active.scopes.includes('files:write'))
      throw integrationError('INTEGRATION_SCOPE_FORBIDDEN', 403);
    const root = await getWorkspaceDatabase({ fields: ['_integrationOperations'] });
    if ((root._integrationOperations || []).some(row => row.key === key && row.expiresAt > Date.now())) throw integrationError('IDEMPOTENCY_KEY_REUSED', 409);
    const cached = await integrationRegistry.mutate(data => {
      data.fileOperations = (data.fileOperations || []).filter(item => item.expiresAt > Date.now());
      const previous = data.fileOperations.find(item => item.key === key);
      if (previous && previous.digest !== digest) throw integrationError('IDEMPOTENCY_KEY_REUSED', 409);
      if (previous) return previous.result || null;
      if (data.fileOperations.length >= 500) throw integrationError('INTEGRATION_OPERATION_LIMIT', 429);
      data.fileOperations.push({ key, digest, integrationId: active.id, expiresAt: Date.now() + 86400000 });
      return null;
    });
    if (cached) return cached;
    const result = await operation(key);
    await integrationRegistry.mutate(data => {
      const record = data.fileOperations.find(item => item.key === key);
      if (record) record.result = result;
    });
    return result;
  });
}
function adapted(request, body, identity) {
  const value = Object.create(request);
  value.body = body;
  value.uploadIdentity = identity;
  value.get = name =>
    name.toLowerCase() === 'x-smena-file-catalog' ? 'demand' : name.toLowerCase() === 'origin' ? process.env.APP_ORIGIN || '' : request.get(name);
  return value;
}
async function readableFile(request, id) {
  const data = await getWorkspaceFileSnapshot(request.user, id);
  const user = currentCatalogUser(data, request.user),
    member = memberForProfile(data, user);
  const file = data.files?.find(file => file.id === id);
  if (
    !member ||
    !file ||
    !canReadProject(
      data.projects.find(project => project.id === file.project),
      member.id,
      user.role,
    )
  )
    throw integrationError('API_NOT_FOUND', 404);
  return file;
}
export function registerPublicApiFiles(router) {
  const filesRead = requireIntegrationScope('files:read'),
    filesWrite = requireIntegrationScope('files:write');
  const run = fn => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
  router.get(
    '/workspaces/:w/files/:id',
    filesRead,
    run(async (req, res) => res.json(fileDto(await readableFile(req, req.params.id)))),
  );
  router.get(
    '/workspaces/:w/files/:id/content',
    filesRead,
    run(async (req, res, next) => {
      await readableFile(req, req.params.id);
      req.query = { download: '1' };
      await streamFileContent(req, res, next);
    }),
  );
  router.post(
    '/workspaces/:w/uploads',
    filesWrite,
    run(async (req, res) => {
      const input = req.body;
      if (
        !input ||
        Object.keys(input).some(key => !['name', 'size', 'mime_type', 'project_id', 'folder_id', 'sha256'].includes(key)) ||
        typeof input.project_id !== 'string' ||
        !/^[a-f0-9]{64}$/.test(input.sha256 || '')
      )
        throw integrationError('INVALID_UPLOAD_FIELDS');
      validateFileUpload({ originalname: input.name, size: input.size, mimetype: input.mime_type || 'application/octet-stream' });
      await target(req, { metadata: input });
      const result = await privateFileOperation(req, 'begin_upload', input, async key => {
        let upload = await integrationRegistry.mutate(data => {
          data.uploads = (data.uploads || []).filter(item => item.expiresAt > Date.now());
          const existing = data.uploads.find(item => item.beginKey === key);
          if (existing) return structuredClone(existing);
          if (data.uploads.length >= 100) throw integrationError('UPLOAD_QUEUE_FULL', 429);
          const id = randomUUID();
          const created = {
            id,
            beginKey: key,
            integrationId: req.integration.id,
            workspaceId: req.integration.workspaceId,
            metadata: input,
            state: 'preparing',
            expiresAt: Date.now() + 7 * 86400000,
            identity: { filename: 'api-' + id, marker: id },
          };
          data.uploads.push(created);
          return structuredClone(created);
        });
        if (!upload.transport) {
          const transport = await startResumableFileUpload(
            adapted(
              req,
              { name: input.name, size: input.size, mimeType: input.mime_type, project: input.project_id, folderId: input.folder_id || null },
              upload.identity,
            ),
          );
          upload = await integrationRegistry.mutate(data => {
            const record = data.uploads.find(item => item.id === upload.id);
            record.transport = transport;
            record.state = 'uploading';
            return structuredClone(record);
          });
        }
        return uploadDto(upload);
      });
      res.status(201).json(result);
    }),
  );
  router.get(
    '/workspaces/:w/uploads/:upload_id',
    filesWrite,
    run(async (req, res) => {
      const upload = await uploadFor(req, req.params.upload_id);
      await target(req, upload);
      res.json({ ...uploadDto(upload), max_file_size: getFileUploadPolicy().maxFileSizeBytes });
    }),
  );
  // Only the explicit local upload command uses this capability endpoint.
  // It is intentionally absent from MCP tool results and ordinary upload status.
  router.get(
    '/workspaces/:w/uploads/:upload_id/transport',
    filesWrite,
    run(async (req, res) => {
      const upload = await uploadFor(req, req.params.upload_id);
      await target(req, upload);
      if (upload.file) return res.json({ completed: true, file: upload.file });
      if (!upload.transport) throw integrationError('UPLOAD_PREPARING', 409);
      const ticket = renewUploadTicket(verifyUploadTicket(upload.transport.ticket, Date.now(), { allowRenewal: true }));
      res.json({ ...upload.transport, ticket, size: upload.metadata.size, sha256: upload.metadata.sha256 });
    }),
  );
  router.post(
    '/workspaces/:w/uploads/:upload_id/complete',
    filesWrite,
    run(async (req, res) => {
      if (!req.body || Object.keys(req.body).some(key => key !== 'file_id') || (req.body.file_id !== undefined && typeof req.body.file_id !== 'string'))
        throw integrationError('INVALID_UPLOAD_FIELDS');
      const upload = await uploadFor(req, req.params.upload_id);
      await target(req, upload);
      const result = await privateFileOperation(req, 'complete_upload', req.body, async () => {
        if (upload.file) return upload.file;
        const ticket = verifyUploadTicket(upload.transport?.ticket, Date.now(), { allowRenewal: true });
        const proof = await getStorageProvider().verifyResumableUpload(ticket.filename, ticket.size, ticket.marker, req.body.file_id || '');
        if (!proof) throw integrationError('UPLOAD_NOT_COMPLETE', 409);
        if (!proof.sha256) throw integrationError('UPLOAD_CHECKSUM_PENDING', 409);
        if (proof.sha256 !== upload.metadata.sha256) throw integrationError('UPLOAD_CHECKSUM_MISMATCH', 409);
        const completion = adapted(req, { ticket: renewUploadTicket(ticket), fileId: proof.fileId });
        completion.expectedSha256 = upload.metadata.sha256;
        const { file } = await completeResumableFileUpload(completion);
        const value = fileDto(file);
        await integrationRegistry.mutate(data => {
          const record = data.uploads.find(item => item.id === upload.id);
          record.file = value;
          record.state = 'completed';
        });
        return value;
      });
      res.json(result);
    }),
  );
  router.post(
    '/workspaces/:w/notes/:id/attachments',
    requireIntegrationScope('knowledge:read'),
    requireIntegrationScope('knowledge:write'),
    filesRead,
    run(async (req, res) => {
      if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.file_id !== 'string') throw integrationError('INVALID_ATTACHMENT');
      const file = await readableFile(req, req.body.file_id);
      // The asset key uses a stable identity, never a private title from a project.
      // Recompute it inside the locked command so parallel attachments cannot erase one another.
      const result = await performIntegrationNoteWrite(req, 'attachment', { attachmentFileId: file.id });
      res.setHeader('ETag', result.result.etag);
      res.json(result.result);
    }),
  );
}
