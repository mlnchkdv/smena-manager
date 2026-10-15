import express from 'express';
import { requireAuth, requireRole } from './auth.js';
import { authRouter } from './auth-routes.js';
import { getWorkspaceDatabase, getWorkspaceStatus, replaceWorkspaceDatabase, RevisionConflictError } from './workspace-store.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
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
    response.json({ data: await getWorkspaceDatabase() });
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspace', requireRole('admin', 'editor'), async (request, response, next) => {
  try {
    const data = await replaceWorkspaceDatabase(request.body?.data, request.body?.revision);
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
    code: error.code || (status === 400 ? 'INVALID_REQUEST' : 'STORAGE_UNAVAILABLE'),
  };
  if (error instanceof RevisionConflictError) body.currentRevision = error.currentRevision;
  response.status(status).json(body);
});
