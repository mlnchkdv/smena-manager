import { activeFileFolder, fileFolderPath } from './file-organization.js';
import { canEditProject } from './project-access.js';

export function fileCollectionOwned(data, user, target) {
  return Boolean(user?.id && target?.owner === user.id && target.workspace === (data.ws?.id || data.ws?.url));
}
export function fileCollectionTarget(data, user, target) {
  if (!fileCollectionOwned(data, user, target)) return null;
  const project = data.projects.find(p => p.id === target.project);
  const folder = activeFileFolder(project, target.folder);
  if (!folder || !canEditProject(project, data.me, user.role)) return null;
  return { project, folder, path: [project.name, ...fileFolderPath(project, folder.id).map(f => f.name)].join(' / ') };
}
