import { requireIntegrationScope } from './public-api-auth.js';
import { researchStore } from './research-store.js';
import { researchError, researchUuid } from '../shared/research.js';
import { integrationRegistry, applyIntegrationMemberAccess, integrationError } from './integration-registry.js';
import { knowledgeActor } from './knowledge-access.js';

const canReadEvidence = integration =>
  integration.scopes.includes('files:read') && integration.policy.uploadsEnabled && process.env.SMENA_PUBLIC_API_UPLOADS_ENABLED !== 'false';

function scopeResearchEvidence(request, result) {
  if (!result.record || canReadEvidence(request.integration)) return result;
  const { record } = result;
  const data = { ...record.data, artifacts: [] };
  if (data.metrics)
    data.metrics = data.metrics.map(metric => {
      const measurement = { ...metric };
      delete measurement.evidenceId;
      return measurement;
    });
  return { ...result, record: { ...record, data } };
}

const authorizeWrite = (request, commands) => async database => {
  const active = applyIntegrationMemberAccess(
    await integrationRegistry.verify(request.integrationToken),
    knowledgeActor(database, request.user, [], { write: true }),
  );
  if (!active.scopes.includes('research:write') || !active.policy.writeEnabled || process.env.SMENA_PUBLIC_API_WRITE_ENABLED === 'false')
    throw integrationError('INTEGRATION_WRITE_DISABLED', 403);
  if (commands.some(command => command.record?.data?.artifacts?.length) && !canReadEvidence(active)) throw integrationError('INTEGRATION_SCOPE_FORBIDDEN', 403);
};

export function registerPublicApiResearch(router) {
  const root = '/workspaces/:w/research/projects';
  const read = requireIntegrationScope('research:read'),
    write = requireIntegrationScope('research:write');
  const route = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
  router.get(
    root,
    read,
    route(async (req, res) => res.json(await researchStore.projects(req.user))),
  );
  router.get(
    root + '/:project',
    read,
    route(async (req, res) => {
      const { q = '', kind, offset = '0', limit = '50' } = req.query;
      if (
        typeof q !== 'string' ||
        q.length > 200 ||
        (kind != null && typeof kind !== 'string') ||
        !/^\d{1,6}$/u.test(offset) ||
        !/^\d{1,3}$/u.test(limit) ||
        Number(limit) < 1 ||
        Number(limit) > 100
      )
        throw researchError();
      res.json(await researchStore.read(req.params.project, req.user, [], { query: q, kind, offset: Number(offset), limit: Number(limit) }));
    }),
  );
  router.get(
    root + '/:project/records/:id',
    read,
    route(async (req, res) => res.json(scopeResearchEvidence(req, await researchStore.read(req.params.project, req.user, [], { id: req.params.id })))),
  );
  router.get(
    root + '/:project/operations/:operation',
    read,
    route(async (req, res) => res.json(scopeResearchEvidence(req, await researchStore.operation(req.params.project, req.params.operation, req.user)))),
  );
  router.post(
    root + '/:project/commands',
    write,
    route(async (req, res) => {
      if (!req.body || !researchUuid(req.get('Idempotency-Key')) || (req.body.operationId && req.body.operationId !== req.get('Idempotency-Key')))
        throw researchError();
      const command = { ...req.body, operationId: req.get('Idempotency-Key') };
      res.json(scopeResearchEvidence(req, await researchStore.command(req.params.project, command, req.user, [], authorizeWrite(req, [command]))));
    }),
  );
  router.post(
    root + '/:project/import',
    write,
    route(async (req, res) => {
      const commands = req.body?.commands;
      if (
        !Array.isArray(commands) ||
        !commands.length ||
        commands.length > 20 ||
        commands.some(row => !['create', 'update'].includes(row?.action) || !researchUuid(row.operationId))
      )
        throw researchError();
      const result = await researchStore.importBatch(req.params.project, req.get('Idempotency-Key'), commands, req.user, [], authorizeWrite(req, commands));
      const { statusCode = 200, ...body } = result;
      res.status(statusCode).json(body);
    }),
  );
}
