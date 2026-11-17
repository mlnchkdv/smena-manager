import { Router } from 'express';
import { requireRole } from './auth.js';
import { fetchPublicPage, pageMetadata, pageError } from './web-page-fetch.js';
import { getWorkspaceDatabase, mutateWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { getStorageProvider } from './storage/index.js';
import { workspaceScope } from './workspace-context.js';
import { bookmarkReaderPage, saveBookmarkSnapshot, readBookmarkSnapshot, SNAPSHOT_LIMIT } from './bookmark-snapshots.js';
import { createBookmarkThumbnailLoader } from './bookmark-thumbnails.js';

export function createBookmarkPageRouter({ fetchPage = fetchPublicPage, loadThumbnail = createBookmarkThumbnailLoader({ fetchPage }) } = {}) {
  const bookmarkPageRouter = Router();
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
  bookmarkPageRouter.get('/:id/image', async (request, response, next) => {
    try {
      const bookmark = await target(request);
      const result = await loadThumbnail(bookmark);
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
      response.json(await readBookmarkSnapshot(getStorageProvider(), workspaceScope(), bookmark, request.params.snapshot));
    } catch (error) {
      next(error.statusCode ? error : pageError());
    }
  });
  bookmarkPageRouter.post('/:id/snapshots', requireRole('admin', 'editor'), async (request, response, next) => {
    try {
      const bookmark = await target(request, true);
      if ((bookmark.pageSnapshots?.length || 0) >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
      const page = bookmarkReaderPage(await fetchPage(bookmark.url));
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
              if ((row.pageSnapshots?.length || 0) >= SNAPSHOT_LIMIT) throw pageError('PAGE_SNAPSHOT_LIMIT', 409);
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
          return response.status(201).json({ snapshot: ref, page });
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
