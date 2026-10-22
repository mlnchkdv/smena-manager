// Build once per render: no persistent cache can outlive a sync or ACL change.
export const normalizeFileSearch = value =>
  String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replaceAll('ё', 'е');
const folderKey = (project, folder) => `${project}\u0000${folder || ''}`;

export function createFileIndex(data, projects, typeNames = {}) {
  const projectMap = new Map(projects.map(project => [project.id, project]));
  const members = new Map((data.members || []).map(member => [member.id, member]));
  const tasks = new Map((data.tasks || []).map(task => [task.id, task]));
  const folders = new Map();
  const paths = new Map();
  const parents = new Set();
  const counts = new Map();
  const folderEntries = [];
  for (const project of projects)
    for (const folder of project.fileFolders || []) {
      folders.set(folderKey(project.id, folder.id), folder);
      if (!folder.archived && folder.parentId) parents.add(folderKey(project.id, folder.parentId));
    }
  function folderPath(projectId, id, visited = new Set()) {
    if (!id) return [];
    const key = folderKey(projectId, id);
    if (paths.has(key)) return paths.get(key);
    const folder = folders.get(key);
    if (!folder || visited.has(id) || visited.size >= 32) return [];
    visited.add(id);
    const path = [...folderPath(projectId, folder.parentId, visited), folder];
    paths.set(key, path);
    return path;
  }
  for (const project of projects)
    for (const folder of project.fileFolders || []) {
      const path = folderPath(project.id, folder.id);
      folderEntries.push({ project, folder, path, search: normalizeFileSearch([project.name, ...path.map(item => item.name)].join(' ')) });
    }
  const files = [];
  const search = new Map();
  let totalBytes = 0;
  const projectsWithFiles = new Set();
  for (const file of data.files || []) {
    const project = projectMap.get(file.project);
    if (!project) continue;
    files.push(file);
    totalBytes += Math.max(0, Number(file.bytes) || 0);
    projectsWithFiles.add(file.project);
    const key = folderKey(file.project, file.folderId);
    counts.set(key, (counts.get(key) || 0) + 1);
    const task = tasks.get(file.task);
    search.set(
      file.id,
      normalizeFileSearch(
        [
          file.name,
          project.name,
          ...folderPath(file.project, file.folderId).map(item => item.name),
          task?.key,
          task?.title,
          members.get(file.by)?.name,
          typeNames[file.type] || file.type,
        ]
          .filter(Boolean)
          .join(' '),
      ),
    );
  }
  return {
    files,
    projectMap,
    folderEntries,
    folderPath,
    totalBytes,
    projectsWithFiles,
    folder: (project, id) => folders.get(folderKey(project, id)),
    count: (project, id) => counts.get(folderKey(project, id)) || 0,
    hasChildren: (project, id) => parents.has(folderKey(project, id)),
    search,
  };
}

export function filterIndexedFiles(index, { project = 'all', folder = null, recursive = false, type = 'all', query = '', sort = 'date' } = {}) {
  const terms = normalizeFileSearch(query).trim().split(/\s+/).filter(Boolean);
  return index.files
    .filter(
      file =>
        (project === 'all' || file.project === project) &&
        (!folder || file.folderId === folder || (recursive && index.folderPath(file.project, file.folderId).some(item => item.id === folder))) &&
        (type === 'all' || file.type === type) &&
        terms.every(term => index.search.get(file.id).includes(term)),
    )
    .sort((left, right) => {
      let order = 0;
      if (sort === 'name') order = left.name.localeCompare(right.name);
      else if (sort === 'size') order = Number(right.bytes || 0) - Number(left.bytes || 0);
      else if (sort === 'project') order = index.projectMap.get(left.project).name.localeCompare(index.projectMap.get(right.project).name);
      else order = Number(right.at || 0) - Number(left.at || 0);
      return order || left.id.localeCompare(right.id);
    });
}
