import { bindAccessProfiles, memberForProfile } from '../shared/member-identity.js';
import { isActiveMember } from '../shared/workspace-membership.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';

// Recheck the locked canonical membership, not just the token/role captured
// before awaiting storage. Binding preserves the legacy initial-admin mapping.
export function knowledgeActor(database, profile, profiles = [], { write = false } = {}) {
  const member = memberForProfile(bindAccessProfiles(database, profiles), profile);
  if (!isActiveMember(member) || (write && workspaceMemberRole(member) === 'viewer'))
    throw Object.assign(new Error('Workspace membership does not allow this action.'), { code: 'WORKSPACE_FORBIDDEN', statusCode: 403 });
  return member;
}
