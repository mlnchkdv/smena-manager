import express from 'express';
import { registerPublicApiWrites } from './public-api-write.js';
import { registerPublicApiFiles } from './public-api-files.js';
import { registerPublicApiResearch } from './public-api-research.js';
import { requireIntegration, requireIntegrationScope } from './public-api-auth.js';
import { integrationError } from './integration-registry.js';
import { getWorkspaceDatabase } from './workspace-store.js';
import { knowledgeActor } from './knowledge-access.js';
import { readKnowledgeNote } from './knowledge-note-store.js';
import { queryKnowledgeIndex } from './knowledge-search-query.js';
import { readKnowledgeVersion } from './knowledge-version-blobs.js';
import { getStorageProvider } from './storage/index.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { INTEGRATION_LIMITS } from '../shared/integration-contract.js';
import { apiNoteDto, apiTextPage, apiDigest, apiInteger, apiText, encodeApiCursor, decodeApiCursor } from './public-api-utils.js';

export const publicApiRouter = express.Router();
publicApiRouter.use((request, response, next) => {
  const started = Date.now();
  response.once('finish', () =>
    console.info('[Integration API]', {
      requestId: request.requestId,
      method: request.method,
      route: request.route?.path || 'authentication',
      status: response.statusCode,
      durationMs: Date.now() - started,
    }),
  );
  next();
});
publicApiRouter.use(requireIntegration);
const read = requireIntegrationScope('knowledge:read');
const route = fn => async (request, response, next) => {
  try {
    await fn(request, response);
  } catch (error) {
    next(error);
  }
};
const database = (request, extra = []) =>
  getWorkspaceDatabase({
    fields: ['ws', 'members', 'knowledgeNotes', 'knowledgeFolders', '_documentRevisions', ...extra],
    knowledgeAuthorize: data => knowledgeActor(data, request.user),
  });
const page = (rows, request, context) => {
  const limit = apiInteger(request.query.limit, INTEGRATION_LIMITS.searchDefault, INTEGRATION_LIMITS.searchMax);
  const offset = decodeApiCursor(request.query.cursor, context + ':' + limit);
  return {
    items: rows.slice(offset, offset + limit),
    next_cursor: offset + limit < rows.length ? encodeApiCursor(context + ':' + limit, offset + limit) : null,
    total: rows.length,
  };
};
publicApiRouter.get(
  '/me',
  // Authentication already checks the live member and personal grant. Context
  // describes this token only; file-only clients need it without note access.
  route(async (req, res) => {
    res.json({
      user: { id: req.user.id, name: req.user.name || '', role: req.user.role },
      workspace: { id: req.integration.workspaceId, name: req.integrationWorkspace.name || '', slug: req.integrationWorkspace.url || '' },
      scopes: req.integration.scopes.filter(
        scope =>
          (!scope.endsWith(':write') || (req.user.role !== 'viewer' && req.integration.policy.writeEnabled)) &&
          (!scope.startsWith('files:') || req.integration.policy.uploadsEnabled),
      ),
      limits: INTEGRATION_LIMITS,
    });
  }),
);
publicApiRouter.get(
  '/workspaces',
  route(async (req, res) =>
    res.json({ items: [{ id: req.integration.workspaceId, name: req.integrationWorkspace.name || '', slug: req.integrationWorkspace.url || '' }] }),
  ),
);
publicApiRouter.get(
  '/workspaces/:w/folders',
  read,
  route(async (req, res) => {
    const data = await database(req);
    const rows = data.knowledgeFolders
      .map(folder => ({ id: folder.id, workspace_id: req.params.w, parent_id: folder.parentId || null, name: folder.name || '' }))
      .sort((a, b) => a.id.localeCompare(b.id));
    res.json(page(rows, req, apiDigest(['folders', req.integration.id, data._documentRevisions?.knowledge?.revision])));
  }),
);
publicApiRouter.get(
  '/workspaces/:w/note-types',
  read,
  route(async (req, res) => res.json({ items: noteTypes(req.integrationWorkspace) })),
);
publicApiRouter.get(
  '/workspaces/:w/notes',
  read,
  route(async (req, res) => {
    const query = apiText(req.query.q),
      folder = apiText(req.query.folder_id, 'all', 180);
    const data = await database(req, ['_knowledgeSearch']);
    if (!['all', 'root'].includes(folder) && !data.knowledgeFolders.some(item => item.id === folder)) throw integrationError('API_NOT_FOUND', 404);
    const found = await queryKnowledgeIndex(data, req.user, [], { query, folder, sort: 'updated' });
    const ids = new Set(found.matches);
    const rows = data.knowledgeNotes
      .filter(note => ids.has(note.id))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.id.localeCompare(b.id));
    const context = apiDigest(['search', req.integration.id, query, folder, found.revision]);
    const selected = page(rows, req, context);
    res.json({
      ...selected,
      items: selected.items.map(note => ({
        ...apiNoteDto(note, req.params.w, data.ws, { summaryOnly: true }),
        snippet: String(found.snippets?.[note.id]?.text || note.bodyPreview || '').slice(0, 240),
      })),
    });
  }),
);
publicApiRouter.get(
  '/workspaces/:w/notes/:id',
  read,
  route(async (req, res) => {
    const result = await readKnowledgeNote(req.params.id, req.user);
    const note = { ...result.note };
    const dto = { ...apiNoteDto(note, req.params.w, req.integrationWorkspace), etag: result.etag, version: result.version };
    res.setHeader('ETag', result.etag);
    res.json({ ...dto, ...apiTextPage(note.formatted_markdown || '', req.query, apiDigest([req.integration.id, req.params.id, result.etag])) });
  }),
);
publicApiRouter.get(
  '/workspaces/:w/notes/:id/revisions',
  read,
  route(async (req, res) => {
    const data = await database(req),
      note = data.knowledgeNotes.find(item => item.id === req.params.id);
    if (!note) throw integrationError('API_NOT_FOUND', 404);
    const rows = (note.history || []).map(item => ({ id: item.id, at: item.at || null, by: item.by || '', integration: item.integrationName || null }));
    res.json(page(rows, req, apiDigest(['revisions', req.integration.id, note.id, rows])));
  }),
);
publicApiRouter.get(
  '/workspaces/:w/notes/:id/revisions/:revision',
  read,
  route(async (req, res) => {
    const data = await database(req),
      note = data.knowledgeNotes.find(item => item.id === req.params.id);
    const reference = note?.history?.find(item => item.id === req.params.revision);
    if (!reference) throw integrationError('API_NOT_FOUND', 404);
    const version = await readKnowledgeVersion(getStorageProvider(), note.id, reference);
    res.json({
      note_id: note.id,
      revision_id: reference.id,
      title: version.title || '',
      at: version.at || null,
      ...apiTextPage(version.formatted_markdown || '', req.query, apiDigest(['revision', req.integration.id, note.id, reference.id])),
    });
  }),
);
registerPublicApiWrites(publicApiRouter);
registerPublicApiFiles(publicApiRouter);
registerPublicApiResearch(publicApiRouter);
publicApiRouter.use((_request, _response, next) => next(integrationError('API_NOT_FOUND', 404)));
export function publicApiError(error, request, response, _next) {
  if (response.headersSent) return _next(error);
  const status = Number(error.statusCode || 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  if (safeStatus === 429) response.setHeader('Retry-After', '60');
  response.status(safeStatus).json({
    code:
      error.type === 'entity.parse.failed'
        ? 'INVALID_JSON'
        : error.type === 'entity.too.large'
          ? 'REQUEST_TOO_LARGE'
          : /^[A-Z0-9_]{1,80}$/.test(error.code || '')
            ? error.code
            : 'API_UNAVAILABLE',
    message: safeStatus === 500 ? 'The operation could not be completed.' : 'The request cannot be completed with the current access, parameters or version.',
    request_id: request.requestId,
  });
}
publicApiRouter.use(publicApiError);
