import { canEditProject } from './project-access.js';
import { canEditFile } from './file-access.js';

const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const fail = message => {
  throw Object.assign(new TypeError(message), { statusCode: 400, code: 'FILE_FOLDER_INVALID' });
};
export const fileFolders = project => (Array.isArray(project?.fileFolders) ? project.fileFolders : []);
export const activeFileFolder = (project, id) => fileFolders(project).find(folder => folder.id === id && !folder.archived) || null;

export function assertFileFolder(project, id) {
  if (id == null || id === '') return null;
  if (!project || !identity(id) || !activeFileFolder(project, id)) fail('This file folder is no longer available.');
  return id;
}

export function validateProjectFileFolders(project) {
  if (project.fileFolders == null) return;
  const folders = project.fileFolders;
  if (!Array.isArray(folders) || folders.length > 2000) fail('Invalid file folders.');
  const byId = new Map();
  const names = new Set();
  for (const folder of folders) {
    if (!folder || !identity(folder.id) || byId.has(folder.id)) fail('Invalid file folders.');
    if (typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 120) fail('Use a folder name between 1 and 120 characters.');
    if (folder.archived != null && typeof folder.archived !== 'boolean') fail('Invalid file folders.');
    if (!folder.archived) {
      const key = `${folder.parentId || ''}\u0000${folder.name.trim().toLocaleLowerCase()}`;
      if (names.has(key)) fail('A file folder with this name already exists here.');
      names.add(key);
    }
    byId.set(folder.id, folder);
  }
  for (const folder of folders) {
    const path = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent || path.has(parentId) || path.size >= 32 || (!folder.archived && parent.archived)) fail('Invalid file folder hierarchy.');
      path.add(parentId);
      parentId = parent.parentId;
    }
  }
}

export function fileFolderPath(project, id) {
  const byId = new Map(fileFolders(project).map(folder => [folder.id, folder]));
  const result = [];
  let current = byId.get(id);
  while (current && result.length < 32 && !result.some(folder => folder.id === current.id)) {
    result.unshift(current);
    current = byId.get(current.parentId);
  }
  return result;
}

function writableProject(data, projectId, role) {
  const project = data.projects?.find(item => item.id === projectId);
  if (!project || !canEditProject(project, data.me, role)) fail('You do not have permission to change this item.');
  return project;
}

export function saveFileFolder(data, { projectId, id, name, parentId = null }, role) {
  const project = writableProject(data, projectId, role);
  const folders = fileFolders(project);
  const existing = folders.find(folder => folder.id === id);
  if (existing?.archived) fail('This file folder is no longer available.');
  const next = { ...(existing || {}), id, name: String(name || '').trim(), parentId: existing ? existing.parentId || null : parentId };
  assertFileFolder(project, next.parentId);
  const candidate = existing ? folders.map(folder => (folder.id === id ? next : folder)) : [...folders, next];
  validateProjectFileFolders({ fileFolders: candidate });
  project.fileFolders = candidate;
  return next;
}

export function archiveFileFolder(data, projectId, id, role) {
  const project = writableProject(data, projectId, role);
  const folder = activeFileFolder(project, id);
  if (!folder) fail('This file folder is no longer available.');
  if (fileFolders(project).some(item => !item.archived && item.parentId === id) || data.files?.some(file => file.project === projectId && file.folderId === id))
    fail('Only an empty file folder can be archived.');
  folder.archived = true;
}

export function restoreFileFolder(data, projectId, id, role) {
  const project = writableProject(data, projectId, role);
  const folder = fileFolders(project).find(item => item.id === id && item.archived);
  if (!folder) fail('This file folder is no longer available.');
  const next = { ...folder, archived: false, parentId: activeFileFolder(project, folder.parentId)?.id || null };
  const candidate = fileFolders(project).map(item => (item.id === id ? next : item));
  validateProjectFileFolders({ fileFolders: candidate });
  project.fileFolders = candidate;
}

export function moveFilesToFolder(data, ids, projectId, folderId, role) {
  const project = writableProject(data, projectId, role);
  const unique = new Set(ids);
  const files = (data.files || []).filter(file => unique.has(file.id));
  if (!unique.size || unique.size > 500 || files.length !== unique.size || files.some(file => file.project !== projectId || !canEditFile(file, data, role)))
    fail('The selected files changed. Select them again.');
  const target = assertFileFolder(project, folderId);
  // Complete every validation before changing any file or task attachment.
  for (const file of files) file.folderId = target;
  for (const task of data.tasks || []) for (const attachment of task.attachments || []) if (unique.has(attachment.id)) attachment.folderId = target;
  return files.length;
}

export function restoredFileFolder(file, data) {
  if (!file?.folderId) return file;
  const project = data.projects?.find(item => item.id === file.project);
  return activeFileFolder(project, file.folderId) ? file : { ...file, folderId: null };
}
