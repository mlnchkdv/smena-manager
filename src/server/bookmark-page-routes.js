import { Router } from 'express';
import { requireRole } from './auth.js';
import { fetchPublicPage, fetchPublicAsset, pageMetadata, pageError } from './web-page-fetch.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { getStorageProvider } from './storage/index.js';
import { workspaceScope, workspaceState } from './workspace-context.js';
import { createBookmarkArchiveJobs } from './bookmark-archive-jobs.js';
import { renderPublicPage } from './bookmark-render.js';
import { bookmarkReaderPage, saveBookmarkSnapshot, readBookmarkSnapshot, bookmarkPageSummary, SNAPSHOT_LIMIT } from './bookmark-snapshots.js';
import { createBookmarkThumbnailLoader, createSavedBookmarkThumbnailLoader } from './bookmark-thumbnails.js';
import { archiveBookmarkHtml, ARCHIVE_CSP } from './bookmark-html-archive.js';

export function createBookmarkPageRouter({
  fetchPage = fetchPublicPage,
  fetchAsset = fetchPublicAsset,
  loadThumbnail = createBookmarkThumbnailLoader({ fetchPage }),
  renderPage = renderPublicPage,
} = {}) {
  const bookmarkPageRouter = Router();
  const jobs = workspaceState(() =>
    createBookmarkArchiveJobs({
      load: getWorkspaceDatabase,
      mutate: mutateWorkspaceDatabase,
      capture: async (url, stage, mode) => {
        const source = await fetchPage(url);
        const page = mode === 'rendered' ? await renderPage(source.url) : source;
        await stage('resources');
        const archive = await archiveBookmarkHtml(page, { fetchAsset });
        if (mode === 'rendered') {
          archive.screenshot = page.screenshot;
          archive.capture = { ...archive.capture, mode: 'rendered-html', viewport: { width: 1280, height: 900 } };
        }
        return archive;
      },
      save: (bookmark, page, id) => saveBookmarkSnapshot(getStorageProvider(), workspaceScope(), bookmark, page, id),
    }),
  );
  const savedThumbnail = createSavedBookmarkThumbnailLoader((bookmark, id) => readBookmarkSnapshot(getStorageProvider(), workspaceScope(), bookmark, id));
  const activeCount = row => (row.pageSnapshots || []).filter(ref => !ref.isArchived).length;
  const requests = new Map();
  bookmarkPageRouter.use((request, response, next) => {
    const images = request.path.endsWith('/image');
    const key = request.user.id + (images ? ':images' : ':pages');
    const now = Date.now();
    const row = requests.get(key);
    const current = row && now - row.at < 60000 ? row : { at: now, count: 0 };
    requests.set(key, current);
    if (requests.size > 2000) requests.delete(requests.keys().next().value);
    if (++current.count > (images ? 150 : 30)) return response.status(429).set('Retry-After', '60').json({ code: 'PAGE_RATE_LIMIT' });
    next();
  });
  bookmarkPageRouter.post('/metadata', requireRole('admin', 'editor'), async (request, response, next) => {
    try {
      if (typeof request.body?.url !== 'string' || request.body.url.length > 4096) throw pageError('PAGE_INVALID_URL');
      const page = await fetchPage(request.body.url);
      response.json(pageMetadata(page.html, page.url));
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });

  async function target(request, write = false) {
    const data = await getWorkspaceDatabase({ fields: ['members', 'links', 'revision'] });
    knowledgeActor(data, request.user, request.configuredProfiles, { write });
    const bookmark = data.links?.find(row => row.id === request.params.id);
    if (!bookmark) throw pageError('PAGE_BOOKMARK_NOT_FOUND', 404);
    return bookmark;
  }
  bookmarkPageRouter.get('/:id/archive-jobs', async (request, response, next) => {
    try {
      response.json({ jobs: await jobs().list(request.user, request.configuredProfiles, request.params.id) });
    } catch (error) {
      next(error);
    }
  });
  bookmarkPageRouter.post('/:id/archive-jobs', requireRole('admin', 'editor'), async (request, response, next) => {
    try {
      response
        .status(202)
        .json({ job: await jobs().create(request.user, request.configuredProfiles, request.params.id, request.body?.key, request.body?.mode) });
    } catch (error) {
      next(error);
    }
  });
  bookmarkPageRouter.get('/:id/image', async (request, response, next) => {
    try {
      const bookmark = await target(request);
      const result = (await savedThumbnail(bookmark, workspaceScope())) || (await loadThumbnail(bookmark));
      if ((await target(request)).url !== bookmark.url) return response.status(204).end();
      response.set({ 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
      if (!result) return response.status(204).end();
      response.type(result.contentType).send(result.body);
    } catch (error) {
      next(error);
    }
  });
  bookmarkPageRouter.post('/:id/preview', async (request, response, next) => {
    try {
      const bookmark = await target(request);
      const page = bookmarkReaderPage(await fetchPage(bookmark.url));
      await target(request);
      response.json(page);
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });
  bookmarkPageRouter.get('/:id/snapshots/:snapshot', async (request, response, next) => {
    try {
      const bookmark = await target(request);
      response.json(bookmarkPageSummary(await readBookmarkSnapshot(getStorageProvider(), workspaceScope(), bookmark, request.params.snapshot)));
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });
  bookmarkPageRouter.get('/:id/snapshots/:snapshot/document', async (request, response, next) => {
    try {
      const bookmark = await target(request);
      const page = await readBookmarkSnapshot(getStorageProvider(), workspaceScope(), bookmark, request.params.snapshot);
      await target(request);
      const document =
        page.format === 'html' && page.document
          ? page.document
          : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved text copy</title></head><body>' +
            page.html +
            '</body></html>';
      response.set({
        'Content-Security-Policy': ARCHIVE_CSP,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      if (request.query.download === '1') response.attachment(`smena-page-${request.params.snapshot}.html`);
      response.type('html').send(document);
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });
  bookmarkPageRouter.patch('/:id/snapshots/:snapshot', requireRole('admin', 'editor'), async (request, response, next) => {
    try {
      if (typeof request.body?.isArchived !== 'boolean') throw pageError('PAGE_INVALID_STATE', 400);
      await target(request, true);
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await getWorkspaceDatabase({ fields: ['revision'] });
        try {
          const result = await mutateWorkspaceDatabase(
            data => {
              knowledgeActor(data, request.user, request.configuredProfiles, { write: true });
              const row = data.links?.find(item => item.id === request.params.id);
              const ref = row?.pageSnapshots?.find(item => item.id === request.params.snapshot);
              if (!ref) throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
              if (!request.body.isArchived && ref.isArchived && activeCount(row) >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
              ref.isArchived = request.body.isArchived;
              const previous = data._documentRevisions?.bookmarks || {};
              data._documentRevisions = {
                ...data._documentRevisions,
                bookmarks: { ...previous, revision: Number(previous.revision || 0) + 1, updatedAt: new Date().toISOString() },
              };
              return data;
            },
            current.revision,
            { role: 'admin', scope: 'bookmarks' },
          );
          return response.json({ snapshots: result.links.find(row => row.id === request.params.id).pageSnapshots });
        } catch (error) {
          if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
        }
      }
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });
  bookmarkPageRouter.post('/:id/snapshots', requireRole('admin', 'editor'), async (request, response, next) => {
    try {
      const bookmark = await target(request, true);
      if (activeCount(bookmark) >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
      const page = await archiveBookmarkHtml(await fetchPage(bookmark.url), { fetchAsset });
      const ref = await saveBookmarkSnapshot(getStorageProvider(), workspaceScope(), bookmark, page);
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await getWorkspaceDatabase({ fields: ['revision'] });
        try {
          // A new page copy adds a physical storage reference. Metadata-only
          // catalog patches deliberately forbid changes to the file registry.
          await mutateWorkspaceDatabase(
            data => {
              knowledgeActor(data, request.user, request.configuredProfiles, { write: true });
              const row = data.links?.find(item => item.id === bookmark.id && item.url === bookmark.url);
              if (!row) throw pageError('PAGE_BOOKMARK_CHANGED', 409);
              if (activeCount(row) >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
              row.pageSnapshots = [ref, ...(row.pageSnapshots || [])];
              const previous = data._documentRevisions?.bookmarks || {};
              data._documentRevisions = {
                ...data._documentRevisions,
                bookmarks: {
                  ...previous,
                  createdAt: previous.createdAt || data.createdAt,
                  revision: Number(previous.revision || 0) + 1,
                  updatedAt: new Date().toISOString(),
                },
              };
              return data;
            },
            current.revision,
            { role: 'admin', scope: 'bookmarks' },
          );
          return response.status(201).json({ snapshot: ref, page: bookmarkPageSummary(page) });
        } catch (error) {
          if (!(error instanceof RevisionConflictError) || attempt === 2) throw error;
        }
      }
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });

  return bookmarkPageRouter;
}
export const bookmarkPageRouter = createBookmarkPageRouter();
