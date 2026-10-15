import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import multer from 'multer';
import { requireRole } from './auth.js';
import { filePresentationType, formatFileSize, getFileResponsePolicy, getFileUploadPolicy, validateFileUpload } from './file-policy.js';
import { getStorageProvider } from './storage/index.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase } from './workspace-store.js';
import { memberForProfile } from '../shared/member-identity.js';

const temporaryDirectory = path.join(os.tmpdir(), 'smena-manager-uploads');
fs.mkdirSync(temporaryDirectory, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, temporaryDirectory),
    filename: (_request, _file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}.upload`),
  }),
  limits: { fileSize: getFileUploadPolicy().maxFileSizeBytes, files: 1, fields: 10 },
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
  return memberForProfile(database, user)?.id || database.me || user.id;
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

fileRouter.get('/policy', (_request, response) => response.json(getFileUploadPolicy()));

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
    const metadata = validateFileUpload(request.file);
    const revision = expectedRevision(request.body?.revision);
    const projectId = String(request.body?.project || '').trim();
    const taskId = String(request.body?.task || '').trim() || null;
    const filename = storageFilename(metadata.name);
    stored = await getStorageProvider().uploadFile(filename, { path: request.file.path, size: metadata.size }, metadata.mimeType);
    let fileRecord;
    const data = await mutateWorkspaceDatabase(
      database => {
        if (!database.projects?.some(project => project.id === projectId)) throw new TypeError('Unknown project.');
        if (taskId && !database.tasks?.some(task => task.id === taskId && task.project === projectId)) throw new TypeError('Unknown task.');
        fileRecord = {
          id: `file-${crypto.randomUUID()}`,
          project: projectId,
          task: taskId,
          name: metadata.name,
          type: filePresentationType(metadata.name),
          size: formatFileSize(metadata.size),
          bytes: metadata.size,
          mimeType: metadata.mimeType,
          storageName: stored.filename,
          storageFileId: stored.fileId,
          ownerId: request.user.id,
          by: memberIdFor(database, request.user),
          at: Date.now(),
        };
        database.files = Array.isArray(database.files) ? database.files : [];
        database.files.unshift(fileRecord);
        if (taskId) {
          const task = database.tasks.find(item => item.id === taskId);
          task.attachments = Array.isArray(task.attachments) ? task.attachments : [];
          task.attachments.push(fileRecord);
        }
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
        .catch(cleanupError => console.error('[Files] Upload rollback failed:', cleanupError));
    next(error);
  } finally {
    if (temporaryPath) await fs.promises.unlink(temporaryPath).catch(() => undefined);
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
    if (project?.private && request.user.role !== 'admin' && !project.members?.includes(memberId)) {
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
        if (request.user.role !== 'admin' && removed.ownerId && removed.ownerId !== request.user.id) {
          throw Object.assign(new Error('Only the owner or an administrator can delete this file.'), { statusCode: 403, code: 'FILE_FORBIDDEN' });
        }
        database.files = database.files.filter(item => item.id !== removed.id);
        if (removed.task) {
          const task = database.tasks?.find(item => item.id === removed.task);
          if (task) task.attachments = (task.attachments || []).filter(item => item.id !== removed.id);
        }
        return database;
      },
      revision,
      { role: request.user.role },
    );
    let cleanupPending = false;
    if (removed.storageName) {
      await getStorageProvider()
        .deleteFile(removed.storageName, removed.storageFileId)
        .catch(error => {
          cleanupPending = true;
          console.error('[Files] Stored file cleanup failed:', error);
        });
    }
    response.json({ file: removed, data, cleanupPending });
  } catch (error) {
    next(error);
  }
});
