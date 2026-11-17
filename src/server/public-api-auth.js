import { integrationRegistry, integrationError, applyIntegrationMemberAccess } from './integration-registry.js';
import { knowledgeActor } from './knowledge-access.js';
import { inWorkspace } from './workspace-context.js';
import { workspaceDirectoryEntries, readWorkspaceCore, workspaceUser } from './workspace-directory.js';

export async function requireIntegration(request, _response, next) {
  try {
    const match = /^Bearer (smena_int_\S+)$/.exec(request.get('authorization') || '');
    if (!match) throw integrationError('INTEGRATION_AUTH_REQUIRED', 401);
    const record = await integrationRegistry.verify(match[1], { touch: true });
    if (request.get('X-Smena-Workspace') || request.query.workspace) throw integrationError('API_WORKSPACE_OVERRIDE', 422);
    const workspaceId = record.workspaceId;
    if (request.path.startsWith('/workspaces/')) {
      let requested;
      try {
        requested = decodeURIComponent(request.path.split('/')[2]);
      } catch {
        throw integrationError('API_NOT_FOUND', 404);
      }
      if (requested !== workspaceId) throw integrationError('API_NOT_FOUND', 404);
    }
    if (workspaceId !== 'default' && !(await workspaceDirectoryEntries()).some(entry => entry.id === workspaceId))
      throw integrationError('WORKSPACE_UNAVAILABLE', 403);
    const data = await readWorkspaceCore(workspaceId);
    request.user = workspaceUser(data, record.profile);
    request.configuredProfiles = [];
    request.integration = applyIntegrationMemberAccess(record, knowledgeActor(data, request.user));
    request.integrationToken = match[1];
    request.integrationWorkspace = data.ws || {};
    inWorkspace(workspaceId, next);
  } catch (error) {
    next(error);
  }
}
export function requireIntegrationScope(scope) {
  return (request, _response, next) => {
    const record = request.integration;
    if (!record.scopes.includes(scope)) return next(integrationError('INTEGRATION_SCOPE_FORBIDDEN', 403));
    if (scope.endsWith(':write') && (request.user.role === 'viewer' || !record.policy.writeEnabled || process.env.SMENA_PUBLIC_API_WRITE_ENABLED === 'false'))
      return next(integrationError('INTEGRATION_WRITE_DISABLED', 403));
    if (scope.startsWith('files:') && (!record.policy.uploadsEnabled || process.env.SMENA_PUBLIC_API_UPLOADS_ENABLED === 'false'))
      return next(integrationError('INTEGRATION_UPLOADS_DISABLED', 403));
    next();
  };
}
