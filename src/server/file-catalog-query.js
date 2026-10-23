import { createFileIndex, filterIndexedFiles } from '../shared/file-index.js';
import { canReadProject } from '../shared/project-access.js';
import { memberForProfile } from '../shared/member-identity.js';

export function catalogQuery(database, user, options = {}) {
  const {
    revision,
    project = 'all',
    context = 'all',
    offset = 0,
    limit = 100,
    query = '',
    type = 'all',
    sort = 'date',
    folder = '',
    recursive = false,
    countFolders = [],
  } = options;
  if (revision !== database.revision)
    throw Object.assign(new Error('The workspace changed after it was loaded. Refresh and retry.'), {
      statusCode: 409,
      code: 'REVISION_CONFLICT',
      currentRevision: database.revision,
    });
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    ![25, 50, 100].includes(limit) ||
    typeof query !== 'string' ||
    query.length > 500 ||
    !['date', 'name', 'size', 'project'].includes(sort) ||
    ![project, context, folder, type].every(value => typeof value === 'string') ||
    !Array.isArray(countFolders) ||
    countFolders.length > 32 ||
    countFolders.some(key => !Array.isArray(key) || key.length !== 2 || key.some(value => typeof value !== 'string'))
  )
    throw new TypeError('Invalid file catalog query.');
  const member = memberForProfile(database, user)?.id || user.id;
  const projects = database.projects.filter(p => !p.archived && canReadProject(p, member, user.role) && (context === 'all' || context === p.id));
  const index = createFileIndex(database, projects, {
    image: 'Image Изображение',
    document: 'Document Документ',
    pdf: 'PDF',
    video: 'Video Видео',
    audio: 'Audio Аудио',
    archive: 'Archive Архив',
    text: 'Text Текст',
    other: 'Other files Другие файлы',
  });
  const results = filterIndexedFiles(index, { project, folder, recursive, type, query, sort });
  const pages = Math.max(1, Math.ceil(results.length / limit));
  const page = Math.min(Math.floor(offset / limit), pages - 1);
  return structuredClone({
    revision,
    files: results.slice(page * limit, (page + 1) * limit),
    page,
    pages,
    total: results.length,
    allTotal: index.files.length,
    totalBytes: index.totalBytes,
    projectCount: index.projectsWithFiles.size,
    folderCounts: countFolders.map(([p, f]) => [p, f, index.count(p, f)]),
    resultIds: results.length <= 500 ? results.map(file => file.id) : null,
  });
}

// Complete the server-owned cascade even when the browser has never loaded
// files from the deleted project/task. No missing client row implies deletion.
export function completeCatalogCascade(current, incoming, files) {
  const projects = new Set((incoming.projects || current.projects).map(p => p.id));
  const tasks = new Set((incoming.tasks || current.tasks).map(t => t.id));
  const removedProjects = new Set(current.projects.filter(p => !projects.has(p.id)).map(p => p.id));
  const removedTasks = new Set(current.tasks.filter(t => !tasks.has(t.id)).map(t => t.id));
  const removed = current.files.filter(file => removedProjects.has(file.project) || removedTasks.has(file.task));
  const previousTrash = new Set((current.trash || []).map(item => item.id));
  for (const item of incoming.trash || []) {
    if (previousTrash.has(item.id)) continue;
    const matches = removed.filter(file =>
      item.kind === 'project' ? file.project === item.data?.project?.id : item.kind === 'task' && file.task === item.data?.task?.id,
    );
    if (matches.length) item.data.files = structuredClone(matches);
  }
  const ids = new Set(removed.map(file => file.id));
  return files.filter(file => !ids.has(file.id));
}
