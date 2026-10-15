import express from 'express';
import { getAccessProfiles, requireAuth, requireRole } from './auth.js';
import { authRouter } from './auth-routes.js';
import { getWorkspaceDatabase, getWorkspaceStatus, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';
import { fileRouter } from './file-routes.js';
import { WORKSPACE_TRANSPORT_MAX_BYTES } from '../shared/workspace-size.js';
import { HTTP_SECURITY_HEADERS } from '../shared/http-security.js';
import { bindAccessProfiles } from '../shared/member-identity.js';
import { restoreUnauthorizedChanges } from '../shared/workspace-permissions.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: WORKSPACE_TRANSPORT_MAX_BYTES }));
app.use((_request, response, next) => {
  for (const [name, value] of Object.entries(HTTP_SECURITY_HEADERS)) response.setHeader(name, value);
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'smena-manager',
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
app.use('/api/files', fileRouter);

app.get('/api/auth/me', (request, response) => {
  response.json({ user: request.user });
});

app.get('/api/storage/status', async (_request, response, next) => {
  try {
    response.json(await getWorkspaceStatus());
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspace', async (_request, response, next) => {
  try {
    const database = await getWorkspaceDatabase();
    response.json({ data: bindAccessProfiles(database, getAccessProfiles()) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    let nextData = request.body?.data;
    if (request.user.role === 'editor') {
      const stored = await getWorkspaceDatabase();
      nextData = restoreUnauthorizedChanges(stored, nextData, request.user.role).data;
    }
    const data = await replaceWorkspaceDatabase(nextData, request.body?.revision, { role: request.user.role });
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.' });
});

app.use((error, _request, response, next) => {
  void next;
  console.error('[API]', error);
  const status = error.statusCode || (error instanceof TypeError ? 400 : 503);
  const body = {
    error: status === 503 ? 'Workspace storage is unavailable.' : error.message,
    code: error.code || (status === 400 ? 'INVALID_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : 'STORAGE_UNAVAILABLE'),
  };
  if (error instanceof RevisionConflictError) body.currentRevision = error.currentRevision;
  if (Number.isSafeInteger(error.maxBytes)) body.maxBytes = error.maxBytes;
  if (Number.isSafeInteger(error.actualBytes)) body.actualBytes = error.actualBytes;
  if (Array.isArray(error.fields)) body.fields = error.fields;
  response.status(status).json(body);
});
