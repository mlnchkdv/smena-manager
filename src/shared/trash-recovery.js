import { canEditProject } from './project-access.js';
import { folderTrail } from './knowledge-tools.js';
export function trashLocation(item, data) {
  const raw = item.data || {};
  const project = raw.project || data.projects?.find(p => p.id === (raw.task?.project || raw.file?.project));
  if (project) return project.name;
  if (item.kind === 'note')
    return folderTrail(raw.note?.folderId, data.knowledgeFolders || [])
      .map(f => f.name)
      .join(' / ');
  if (item.kind === 'bookmark') return data.linkFolders?.find(f => f.id === raw.link?.folder)?.name || '';
  return '';
}
export function trashRestorePlan(item, data, memberId, role) {
  const raw = item?.data || {},
    kind = item?.kind;
  const field = { project: 'project', task: 'task', file: 'file', note: 'note', bookmark: 'link' }[kind];
  const collection = { project: 'projects', task: 'tasks', file: 'files', note: 'knowledgeNotes', bookmark: 'links' }[kind];
  const record = raw[field];
  let error = !record?.id || !['admin', 'editor'].includes(role) ? 'Restore is unavailable.' : '';
  const project = kind === 'project' ? record : data.projects?.find(p => p.id === record?.project);
  if (['project', 'task', 'file'].includes(kind) && (!project || !canEditProject(project, memberId, role)))
    error = 'The destination project is unavailable or cannot be edited.';
  if (record && data[collection]?.some(value => value.id === record.id)) error = 'An item with this ID already exists. Nothing will be overwritten.';
  for (const key of ['tasks', 'comments', 'files'])
    if (raw[key]?.some(value => data[key]?.some(existing => existing.id === value.id)))
      error = 'An item with this ID already exists. Nothing will be overwritten.';
  const missingFolder =
    kind === 'note'
      ? !!record?.folderId && !data.knowledgeFolders?.some(f => f.id === record.folderId)
      : kind === 'bookmark'
        ? !!record?.folder && !data.linkFolders?.some(f => f.id === record.folder)
        : kind === 'file'
          ? !!record?.folderId && !project?.fileFolders?.some(f => f.id === record.folderId && !f.archived)
          : false;
  return {
    error,
    target: trashLocation(item, data),
    missingFolder,
    sameName: !!record && data[collection]?.some(value => (value.title || value.name) === (record.title || record.name)),
  };
}
