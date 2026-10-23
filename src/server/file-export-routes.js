import { Router } from 'express';
import { once } from 'node:events';
import { getWorkspaceDatabase, getWorkspaceExportSnapshot, mutateWorkspaceDatabase } from './workspace-store.js';
import { getStorageProvider } from './storage/index.js';
import { createFileExportService } from './file-export-jobs.js';
import { exportDigest, readExportPart } from './file-export-zip.js';

export const fileExportRouter = Router();
const service = () =>
  createFileExportService({ load: getWorkspaceDatabase, loadRead: getWorkspaceExportSnapshot, mutate: mutateWorkspaceDatabase, storage: getStorageProvider() });
fileExportRouter.get('/', async (request, response, next) => {
  try {
    response.json({ jobs: await service().list(request.user) });
  } catch (error) {
    next(error);
  }
});
fileExportRouter.post('/', async (request, response, next) => {
  try {
    response.status(201).json({ job: await service().create(request.user, request.body.ids) });
  } catch (error) {
    next(error);
  }
});
fileExportRouter.post('/:id/advance', async (request, response, next) => {
  try {
    response.json({ job: await service().advance(request.user, request.params.id) });
  } catch (error) {
    next(error);
  }
});
fileExportRouter.delete('/:id', async (request, response, next) => {
  try {
    response.json({ job: await service().cancel(request.user, request.params.id) });
  } catch (error) {
    next(error);
  }
});

export function exportRange(value, size) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? { start, end, partial: true } : null;
}
fileExportRouter.get('/:id/download', async (request, response, next) => {
  const controller = new AbortController();
  const stop = () => {
    if (!response.writableFinished) controller.abort();
  };
  const timer = setTimeout(() => controller.abort(), 45000);
  response.once('close', stop);
  try {
    if (request.query.account !== request.user.id) throw Object.assign(new Error('The account changed.'), { statusCode: 409 });
    const jobs = service(),
      { layout } = await jobs.result(request.user, request.params.id);
    const etag = `"${layout.digest}"`;
    const range = exportRange(!request.get('if-range') || request.get('if-range') === etag ? request.get('range') : null, layout.bytes);
    if (!range) return response.status(416).set('Content-Range', `bytes */${layout.bytes}`).end();
    response.status(range.partial ? 206 : 200);
    response.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="smena-files-resumable.zip"',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(range.end - range.start + 1),
      ETag: etag,
      'Cache-Control': 'private, no-cache',
      'X-Accel-Buffering': 'no',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (range.partial) response.set('Content-Range', `bytes ${range.start}-${range.end}/${layout.bytes}`);
    for (const segment of layout.segments) {
      if (segment.start > range.end || segment.start + segment.size <= range.start) continue;
      controller.signal.throwIfAborted();
      await jobs.validate(request.user, request.params.id);
      let bytes = segment.buffer;
      if (segment.part) {
        bytes = await readExportPart(getStorageProvider(), segment.part, { expectedSize: segment.part.bytes, signal: controller.signal });
        if (exportDigest(bytes) !== segment.part.sha256) throw Error('Export checksum does not match.');
      }
      await jobs.validate(request.user, request.params.id);
      const start = Math.max(0, range.start - segment.start),
        end = Math.min(segment.size, range.end - segment.start + 1);
      for (let offset = start; offset < end; offset += 65536) {
        controller.signal.throwIfAborted();
        if (!response.write(bytes.subarray(offset, Math.min(end, offset + 65536)))) await once(response, 'drain', { signal: controller.signal });
      }
    }
    response.end();
  } catch (error) {
    if (response.headersSent) response.destroy(error);
    else {
      for (const name of ['Content-Length', 'Content-Type', 'Content-Disposition', 'Content-Range', 'ETag']) response.removeHeader(name);
      next(error);
    }
  } finally {
    clearTimeout(timer);
    response.removeListener('close', stop);
  }
});
