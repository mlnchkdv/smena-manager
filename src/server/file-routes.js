import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Router, urlencoded } from 'express';
import multer from 'multer';
import { requireRole } from './auth.js';
import { filePresentationType, formatFileSize, getFileResponsePolicy, getFileUploadPolicy, validateFileUpload, multipartFilename } from './file-policy.js';
import { getStorageProvider } from './storage/index.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';
import { createUploadTicket, verifyUploadTicket } from './upload-ticket.js';
import { detachTaskFile } from '../shared/file-identity.js';
import { memberForProfile } from '../shared/member-identity.js';
import { canEditProject, canReadProject } from '../shared/project-access.js';
import { retainDetachedFile } from './file-retention.js';
import { reportProviderError } from './provider-safety.js';
import { registerFileMetadata } from './file-registry.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { assertFileFolder } from '../shared/file-organization.js';
import { fileCatalogPage } from '../shared/file-catalog.js';
import { projectWorkspace } from './workspace-policy.js';
import { createFileArchivePlan, STREAM_ZIP_POLICY } from '../shared/file-archive-policy.js';
import { streamFileArchive } from './file-archive-stream.js';
import { fileCatalogVersion } from './file-catalog-version.js';
import { assertArchiveFileAccess } from './file-archive-access.js';

const temporaryDirectory = path.join(os.tmpdir(), 'smena-manager-uploads');
const DIRECT_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
fs.mkdirSync(temporaryDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, temporaryDirectory),
    filename: (_request, _file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.upload`),
  }),
  limits: { fileSize: getFileUploadPolicy().proxyMaxFileSizeBytes, files: 1, fields: 10 },
});

function expectedRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('A non-negative expected revision is required.');
  return revision;
}

function storageFilename(originalName) {
  const extension = path
    .extname(originalName)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '')
    .slice(0, 12);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
}

function memberIdFor(database, user) {
  return memberForProfile(database, user)?.id || user.id;
}

function assertFileTarget(database, user, projectId, taskId, folderId = null) {
  const project = database.projects?.find(item => item.id === projectId);
  if (!project) throw new TypeError('Unknown project.');
  const memberId = memberIdFor(database, user);
  const member = database.members?.find(item => item.id === memberId);
  if (!member || ['removed', 'deactivated'].includes(member.status) || !canEditProject(project, memberId, workspaceMemberRole(member))) {
    throw Object.assign(new Error('You do not have access to this project.'), { statusCode: 403, code: 'FILE_FORBIDDEN' });
  }
  if (taskId && !database.tasks?.some(task => task.id === taskId && task.project === projectId)) throw new TypeError('Unknown task.');
  assertFileFolder(project, folderId);
}

function appendFileRecord(database, user, metadata, stored, projectId, taskId, folderId = null) {
  assertFileTarget(database, user, projectId, taskId, folderId);
  const existing = database.files?.find(item => item.storageFileId === stored.fileId);
  if (existing) return existing;
  const fileRecord = {
    id: `file-${crypto.randomUUID()}`,
    project: projectId,
    task: taskId,
    folderId,
    name: metadata.name,
    type: filePresentationType(metadata.name),
    size: formatFileSize(metadata.size),
    bytes: metadata.size,
    mimeType: metadata.mimeType,
    storageName: stored.filename,
    storageFileId: stored.fileId,
    ownerId: user.id,
    by: memberIdFor(database, user),
    at: Date.now(),
  };
  database.files = Array.isArray(database.files) ? database.files : [];
  database.files.unshift(fileRecord);
  registerFileMetadata(database, fileRecord, true);
  database._pendingUploads = (database._pendingUploads || []).filter(upload => upload.filename !== stored.filename);
  if (taskId) {
    const task = database.tasks.find(item => item.id === taskId);
    task.attachments = Array.isArray(task.attachments) ? task.attachments : [];
    task.attachments.push(fileRecord);
  }
  return fileRecord;
}

function parseRange(value, size) {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Math.min(size, Number(match[2]));
    return Number.isFinite(suffix) && suffix > 0 ? { start: size - suffix, end: size - 1 } : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start <= end ? { start, end } : null;
}

function contentDisposition(filename, attachment) {
  const fallback = filename.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 160) || 'download';
  return `${attachment ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const fileRouter = Router();
const activeArchives = new Map();
fileRouter.post('/archive/preflight', async (request, response, next) => {
  try {
    const database = await getWorkspaceDatabase();
    if (database.revision !== expectedRevision(request.body.revision)) throw new RevisionConflictError(database.revision);
    const plan = createFileArchivePlan({ ...database, me: memberIdFor(database, request.user) }, request.body.ids, request.user.role, STREAM_ZIP_POLICY);
    for (const item of plan) assertArchiveFileAccess(database, request.user, item.file);
    if (activeArchives.get(request.user.id) > Date.now() || [...activeArchives.values()].filter(expiry => expiry > Date.now()).length >= 8)
      throw Object.assign(new Error('Another archive is being downloaded. Try again later.'), { statusCode: 429 });
    response.json({ revision: database.revision, files: plan.length, bytes: plan.reduce((sum, item) => sum + item.file.bytes, 0) });
  } catch (error) {
    next(error);
  }
});
fileRouter.post('/archive', urlencoded({ extended: false, limit: '128kb', parameterLimit: 5 }), async (request, response, next) => {
  const controller = new AbortController();
  let timer,
    lease = null;
  const abort = () => {
    if (!response.writableFinished) controller.abort(new Error('Archive download interrupted.'));
  };
  try {
    for (const [id, expires] of activeArchives) if (expires <= Date.now()) activeArchives.delete(id);
    if (request.get('sec-fetch-site') === 'cross-site' || !request.query.account || request.query.account !== request.user.id)
      throw Object.assign(new Error('The account changed in another tab. Reload this page to continue.'), { statusCode: 403 });
    if (activeArchives.has(request.user.id) || activeArchives.size >= 8)
      throw Object.assign(new Error('Another archive is being downloaded. Try again later.'), { statusCode: 429 });
    lease = Date.now() + 55000;
    activeArchives.set(request.user.id, lease);
    const database = await getWorkspaceDatabase();
    if (database.revision !== expectedRevision(request.body.revision)) throw new RevisionConflictError(database.revision);
    const ids = typeof request.body.ids === 'string' ? JSON.parse(request.body.ids) : request.body.ids;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new TypeError('Invalid file selection.');
    const data = { ...database, me: memberIdFor(database, request.user) };
    const plan = createFileArchivePlan(data, ids, request.user.role, STREAM_ZIP_POLICY);
    timer = setTimeout(() => controller.abort(new Error('Archive time limit reached. Download a smaller batch.')), 45000);
    response.once('close', abort);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', 'attachment; filename="smena-files-stream.zip"');
    response.setHeader('X-Accel-Buffering', 'no');
    await streamFileArchive(
      plan,
      response,
      (file, signal) => {
        const pending = getStorageProvider().openDownloadStream(file.storageName, file.storageFileId);
        return new Promise((resolve, reject) => {
          const cancel = () => reject(signal.reason);
          signal.addEventListener('abort', cancel, { once: true });
          pending.then(
            result => {
              signal.removeEventListener('abort', cancel);
              if (signal.aborted) {
                result?.stream?.destroy();
                reject(signal.reason);
              } else resolve(result);
            },
            error => {
              signal.removeEventListener('abort', cancel);
              reject(error);
            },
          );
        });
      },
      {
        signal: controller.signal,
        validate: async file => {
          const latest = await getWorkspaceDatabase();
          assertArchiveFileAccess(latest, request.user, file);
        },
      },
    );
  } catch (error) {
    if (response.headersSent) response.destroy(error);
    else {
      response.removeHeader('Content-Disposition');
      response.removeHeader('Content-Type');
      next(error);
    }
  } finally {
    clearTimeout(timer);
    response.removeListener('close', abort);
    if (lease && activeArchives.get(request.user.id) === lease) activeArchives.delete(request.user.id);
  }
});

fileRouter.get('/catalog', async (request, response, next) => {
  try {
    const data = projectWorkspace(await getWorkspaceDatabase(), request.user);
    response.json(
      fileCatalogPage(data, {
        revision: Number(request.query.revision),
        offset: Number(request.query.offset || 0),
        project: request.query.project || 'all',
        token: request.query.token,
        expectedToken: request.query.token ? fileCatalogVersion(data.files) : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

fileRouter.get('/policy', (_request, response) => {
  const policy = getFileUploadPolicy();
  const storage = getStorageProvider();
  response.json({ ...policy, directUploadEnabled: typeof storage.createResumableUpload === 'function' });
});

const receiveSingleFile = (request, response, next) => {
  upload.single('file')(request, response, error => {
    if (error) {
      error.statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      next(error);
    } else next();
  });
};

fileRouter.post('/upload', requireRole('admin', 'editor'), receiveSingleFile, async (request, response, next) => {
  const temporaryPath = request.file?.path;
  let stored = null;
  try {
    if (!request.file) throw new TypeError('No file was uploaded.');
    const metadata = validateFileUpload(
      { ...request.file, originalname: typeof request.body?.name === 'string' ? request.body.name : multipartFilename(request.file.originalname) },
      process.env,
      { proxy: true },
    );
    const revision = expectedRevision(request.body?.revision);
    const projectId = String(request.body?.project || '').trim();
    const taskId = String(request.body?.task || '').trim() || null;
    const folderId = request.body?.folderId || null;
    const filename = storageFilename(metadata.name);
    assertFileTarget(await getWorkspaceDatabase(), request.user, projectId, taskId, folderId);
    stored = await getStorageProvider().uploadFile(filename, { path: request.file.path, size: metadata.size }, metadata.mimeType);
    let fileRecord;
    const data = await mutateWorkspaceDatabase(
      database => {
        fileRecord = appendFileRecord(database, request.user, metadata, stored, projectId, taskId, folderId);
        return database;
      },
      revision,
      { role: request.user.role },
    );
    response.status(201).json({ file: fileRecord, data });
  } catch (error) {
    if (stored)
      await getStorageProvider()
        .deleteFile(stored.filename, stored.fileId)
        .catch(cleanupError => reportProviderError('[Files] Upload rollback failed', cleanupError));
    next(error);
  } finally {
    if (temporaryPath) await fs.promises.unlink(temporaryPath).catch(() => undefined);
  }
});

fileRouter.post('/upload-session', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    const metadata = validateFileUpload({
      originalname: request.body?.name,
      mimetype: request.body?.mimeType,
      size: request.body?.size,
    });
    const projectId = String(request.body?.project || '').trim();
    const taskId = String(request.body?.task || '').trim() || null;
    const folderId = request.body?.folderId || null;
    assertFileTarget(await getWorkspaceDatabase(), request.user, projectId, taskId, folderId);
    const storage = getStorageProvider();
    if (typeof storage.createResumableUpload !== 'function') {
      throw Object.assign(new Error('Direct uploads are unavailable for this storage provider.'), {
        statusCode: 409,
        code: 'DIRECT_UPLOAD_UNAVAILABLE',
      });
    }
    const filename = storageFilename(metadata.name);
    const marker = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await getWorkspaceDatabase();
      try {
        await mutateWorkspaceDatabase(
          database => {
            assertFileTarget(database, request.user, projectId, taskId, folderId);
            const pending = database._pendingUploads || [];
            if (pending.length >= 500)
              throw Object.assign(new Error('Too many pending uploads. Try again later.'), { statusCode: 429, code: 'UPLOAD_QUEUE_FULL' });
            database._pendingUploads = [
              ...pending,
              {
                filename,
                marker,
                size: metadata.size,
                mimeType: metadata.mimeType,
                ownerId: request.user.id,
                projectId,
                taskId,
                folderId,
                createdAt: Date.now(),
              },
            ];
            return database;
          },
          current.revision,
          { role: 'admin' },
        );
        break;
      } catch (error) {
        if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
      }
    }
    const session = await storage.createResumableUpload(
      filename,
      metadata.size,
      metadata.mimeType,
      marker,
      request.get('origin') || process.env.APP_ORIGIN || '',
    );
    const ticket = createUploadTicket({
      profileId: request.user.id,
      projectId,
      taskId,
      folderId,
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
      filename,
      marker,
    });
    response.setHeader('Cache-Control', 'no-store');
    response.status(201).json({ uploadUrl: session.uploadUrl, ticket, chunkSizeBytes: DIRECT_UPLOAD_CHUNK_BYTES });
  } catch (error) {
    next(error);
  }
});

fileRouter.post('/upload-complete', requireRole('admin', 'editor'), async (request, response, next) => {
  let stored = null;
  try {
    const ticket = verifyUploadTicket(request.body?.ticket);
    if (ticket.profileId !== request.user.id) {
      throw Object.assign(new Error('This upload belongs to another account.'), { statusCode: 403, code: 'FILE_FORBIDDEN' });
    }
    const storage = getStorageProvider();
    if (typeof storage.verifyResumableUpload !== 'function') {
      throw Object.assign(new Error('Direct uploads are unavailable for this storage provider.'), {
        statusCode: 409,
        code: 'DIRECT_UPLOAD_UNAVAILABLE',
      });
    }
    stored = await storage.verifyResumableUpload(ticket.filename, ticket.size, ticket.marker, String(request.body?.fileId || '').trim());
    if (!stored) {
      throw Object.assign(new Error('The uploaded Google Drive file could not be verified.'), {
        statusCode: 400,
        code: 'UPLOAD_VERIFICATION_FAILED',
      });
    }
    const metadata = { name: ticket.name, size: ticket.size, mimeType: ticket.mimeType };
    let fileRecord;
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await getWorkspaceDatabase();
      assertFileTarget(current, request.user, ticket.projectId, ticket.taskId, ticket.folderId);
      const existing = current.files?.find(item => item.storageFileId === stored.fileId);
      if (existing) {
        fileRecord = existing;
        data = current;
        break;
      }
      try {
        data = await mutateWorkspaceDatabase(
          database => {
            fileRecord = appendFileRecord(database, request.user, metadata, stored, ticket.projectId, ticket.taskId, ticket.folderId);
            return database;
          },
          current.revision,
          { role: request.user.role },
        );
        break;
      } catch (error) {
        if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
      }
    }
    response.status(201).json({ file: fileRecord, data });
  } catch (error) {
    next(error);
  }
});

fileRouter.get('/:id/content', async (request, response, next) => {
  try {
    const database = await getWorkspaceDatabase();
    const file = database.files?.find(item => item.id === request.params.id);
    if (!file?.storageName) {
      response.status(404).json({ error: 'Stored file not found.', code: 'FILE_NOT_FOUND' });
      return;
    }
    const project = database.projects?.find(item => item.id === file.project);
    const memberId = memberIdFor(database, request.user);
    if (!canReadProject(project, memberId, request.user.role)) {
      response.status(403).json({ error: 'You do not have access to this file.', code: 'FILE_FORBIDDEN' });
      return;
    }
    const range = parseRange(request.get('range'), Number(file.bytes || 0));
    if (request.get('range') && !range) {
      response
        .status(416)
        .setHeader('Content-Range', `bytes */${file.bytes || 0}`)
        .end();
      return;
    }
    const result = await getStorageProvider().openDownloadStream(file.storageName, file.storageFileId, range);
    if (!result) {
      response.status(404).json({ error: 'Stored file is unavailable.', code: 'FILE_UNAVAILABLE' });
      return;
    }
    const partial = Boolean(range);
    response.status(partial ? 206 : 200);
    response.setHeader('Accept-Ranges', 'bytes');
    const responsePolicy = getFileResponsePolicy(file.name, file.mimeType || result.mimeType, request.query.download === '1');
    response.setHeader('Content-Type', responsePolicy.contentType);
    response.setHeader('Content-Disposition', contentDisposition(file.name, responsePolicy.attachment));
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Length', String(result.end - result.start + 1));
    if (partial) response.setHeader('Content-Range', `bytes ${result.start}-${result.end}/${result.size}`);
    await pipeline(result.stream, response);
  } catch (error) {
    next(error);
  }
});

fileRouter.delete('/:id', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    const revision = expectedRevision(request.body?.revision);
    let removed;
    const data = await mutateWorkspaceDatabase(
      database => {
        removed = database.files?.find(item => item.id === request.params.id);
        if (!removed) throw Object.assign(new Error('File not found.'), { statusCode: 404, code: 'FILE_NOT_FOUND' });
        assertFileTarget(database, request.user, removed.project, removed.task);
        if (request.user.role !== 'admin' && removed.ownerId && removed.ownerId !== request.user.id) {
          throw Object.assign(new Error('Only the owner or an administrator can delete this file.'), { statusCode: 403, code: 'FILE_FORBIDDEN' });
        }
        database.files = database.files.filter(item => item.id !== removed.id);
        retainDetachedFile(database, removed);
        if (removed.task) {
          const task = database.tasks?.find(item => item.id === removed.task);
          detachTaskFile(task, removed);
        }
        return database;
      },
      revision,
      { role: request.user.role },
    );
    response.json({ file: removed, data, cleanupPending: false, contentRetainedForBackups: Boolean(removed.storageName) });
  } catch (error) {
    next(error);
  }
});
