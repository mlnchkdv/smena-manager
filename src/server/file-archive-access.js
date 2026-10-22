import { memberForProfile } from '../shared/member-identity.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';
import { canReadProject } from '../shared/project-access.js';

export function assertArchiveFileAccess(data, user, expected) {
  const member = memberForProfile(data, user);
  const current = data.files?.find(file => file.id === expected.id);
  const project = data.projects?.find(item => item.id === current?.project);
  if (
    !member ||
    ['removed', 'deactivated'].includes(member.status) ||
    !project ||
    project.archived ||
    !canReadProject(project, member.id, workspaceMemberRole(member)) ||
    current.storageName !== expected.storageName ||
    current.storageFileId !== expected.storageFileId
  )
    throw Object.assign(new Error('The selected files changed. Select them again.'), { statusCode: 403 });
  return current;
}
