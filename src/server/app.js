import express from 'express';
import { requireAuth } from './auth.js';
import { authRouter } from './auth-routes.js';
import { getWorkspaceStatus } from './workspace-store.js';

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

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.' });
});

app.use((error, _request, response, next) => {
  void next;
  console.error('[API]', error);
  response.status(503).json({
    error: 'Storage is unavailable.',
    code: 'STORAGE_UNAVAILABLE',
  });
});
