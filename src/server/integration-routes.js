import express from 'express';
import { integrationRegistry } from './integration-registry.js';
import { workspaceScope } from './workspace-context.js';
import { knowledgeActor } from './knowledge-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { getWorkspaceDatabase } from './workspace-store.js';
import { bindAccessProfiles } from '../shared/member-identity.js';
import { isActiveMember } from '../shared/workspace-membership.js';

export const integrationRouter = express.Router();
integrationRouter.use(async (request, _response, next) => {
  try {
    const data = await getWorkspaceDatabase({ fields: ['members'] });
    // Configured login profiles belong to the original workspace's legacy
    // bootstrap. Never synthesize those members in an independent workspace.
    const profiles = workspaceScope() === 'default' ? request.configuredProfiles : [];
    const member = knowledgeActor(data, request.user, profiles);
    request.integrationMember = member;
    request.integrationMembers = bindAccessProfiles(data, profiles).members;
    request.user = { ...request.user, role: workspaceMemberRole(member) };
    next();
  } catch (error) {
    next(error);
  }
});
integrationRouter.get('/', async (request, response, next) => {
  try {
    response.json({
      ...(await integrationRegistry.list(request.user, workspaceScope(), request.integrationMember, request.integrationMembers.filter(isActiveMember))),
      canManage: request.user.role === 'admin',
      canWrite: request.user.role !== 'viewer',
    });
  } catch (error) {
    next(error);
  }
});
integrationRouter.patch('/members/:id', async (request, response, next) => {
  try {
    if (request.user.role !== 'admin') return response.sendStatus(403);
    const member = request.integrationMembers.find(item => item.id === request.params.id && isActiveMember(item));
    if (!member) return response.sendStatus(404);
    response.json(await integrationRegistry.setMemberAccess(request.user, workspaceScope(), member, request.body, request.integrationMembers));
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
    response.status(201).json(await integrationRegistry.create(request.user, workspaceScope(), request.body, request.integrationMember));
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
