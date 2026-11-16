import express from 'express';
import { integrationRegistry } from './integration-registry.js';
import { workspaceScope } from './workspace-context.js';
import { knowledgeActor } from './knowledge-access.js';
import { getWorkspaceDatabase } from './workspace-store.js';

export const integrationRouter = express.Router();
integrationRouter.use(async (request, _response, next) => {
  try {
    const data = await getWorkspaceDatabase({ fields: ['members'] });
    knowledgeActor(data, request.user, request.configuredProfiles);
    next();
  } catch (error) {
    next(error);
  }
});
integrationRouter.get('/', async (request, response, next) => {
  try {
    response.json({
      ...(await integrationRegistry.list(request.user, workspaceScope())),
      canManage: request.user.role === 'admin',
      canWrite: request.user.role !== 'viewer',
    });
  } catch (error) {
    next(error);
  }
});
integrationRouter.patch('/policy', async (request, response, next) => {
  try {
    if (request.user.role !== 'admin') return response.sendStatus(403);
    response.json(await integrationRegistry.policy(workspaceScope(), request.body));
  } catch (error) {
    next(error);
  }
});
integrationRouter.post('/', async (request, response, next) => {
  try {
    response.status(201).json(await integrationRegistry.create(request.user, workspaceScope(), request.body));
  } catch (error) {
    next(error);
  }
});
integrationRouter.delete('/:id', async (request, response, next) => {
  try {
    response.json(await integrationRegistry.revoke(request.user, workspaceScope(), request.params.id));
  } catch (error) {
    next(error);
  }
});
