import { Router } from 'express';
import { strToU8, zipSync } from 'fflate';
import { researchStore } from './research-store.js';
import { requireRole } from './auth.js';
import { researchError } from '../shared/research.js';
import { researchFiles } from './research-evidence.js';

export const researchRouter = Router();
const route = operation => async (request, response, next) => {
  try {
    await operation(request, response);
  } catch (error) {
    next(error);
  }
};
const args = request => [request.params.project, request.user, request.configuredProfiles || []];
researchRouter.get(
  '/search',
  route(async (request, response) => {
    const { q, offset = '0', limit = '30' } = request.query;
    if (typeof q !== 'string' || !q.trim() || q.length > 500 || !/^\d{1,6}$/u.test(offset) || !/^[1-9]\d?$/u.test(limit) || Number(limit) > 50)
      throw researchError();
    response.json(
      await researchStore.search(request.user, request.configuredProfiles || [], { query: q.trim(), offset: Number(offset), limit: Number(limit) }),
    );
  }),
);
researchRouter.get(
  '/projects/:project/records/:id/export',
  route(async (request, response) => {
    const result = await researchStore.exportRecord(
      request.params.project,
      request.params.id,
      request.user,
      request.configuredProfiles || [],
      request.query.lang === 'ru',
    );
    if (request.query.format !== 'zip') return response.json(result);
    const entries = Object.fromEntries(Object.entries(result.files).map(([name, text]) => [name, strToU8(text)]));
    response.attachment(result.filename).send(Buffer.from(zipSync(entries, { level: 3 })));
  }),
);
researchRouter.get(
  '/projects/:project/operations/:operation',
  route(async (request, response) => {
    response.json(await researchStore.operation(request.params.project, request.params.operation, request.user, request.configuredProfiles || []));
  }),
);
researchRouter.get(
  '/projects/:project/files',
  route(async (request, response) => {
    await researchStore.read(...args(request), { limit: 1 });
    if (typeof (request.query.q || '') !== 'string' || (request.query.q || '').length > 200) throw researchError();
    response.json({ items: await researchFiles(request.params.project, request.user, request.query.q) });
  }),
);
researchRouter.get(
  '/projects/:project',
  route(async (request, response) => {
    const { q = '', kind, experiment, archived, offset = '0', limit = '50' } = request.query;
    if (
      typeof q !== 'string' ||
      q.length > 200 ||
      (kind != null && typeof kind !== 'string') ||
      (experiment != null && (typeof experiment !== 'string' || experiment.length > 180)) ||
      !/^\d{1,6}$/u.test(offset) ||
      !/^\d{1,3}$/u.test(limit) ||
      Number(limit) < 1 ||
      Number(limit) > 100
    )
      throw researchError();
    response.json(
      await researchStore.read(...args(request), {
        query: q,
        kind,
        experimentId: experiment,
        archived: archived === 'true',
        offset: Number(offset),
        limit: Number(limit),
      }),
    );
  }),
);
researchRouter.get(
  '/projects/:project/records/:id',
  route(async (request, response) => {
    const result = await researchStore.read(...args(request), { id: request.params.id });
    response.setHeader('ETag', `"research-${request.params.id}-${result.record.revision}"`);
    response.json(result);
  }),
);
researchRouter.get(
  '/projects/:project/records/:id/history',
  route(async (request, response) => {
    if (request.query.cursor != null && !/^[a-f0-9]{64}$/u.test(request.query.cursor)) throw researchError();
    response.json(await researchStore.history(request.params.project, request.params.id, request.user, request.configuredProfiles || [], request.query.cursor));
  }),
);
researchRouter.post(
  '/projects/:project/commands',
  requireRole('admin', 'editor'),
  route(async (request, response) => {
    response.json(await researchStore.command(request.params.project, request.body, request.user, request.configuredProfiles || []));
  }),
);
