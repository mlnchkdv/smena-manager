import { validateProjectFileFolders, assertFileFolder } from './file-organization.js';
export function planFileImport(project, files, parentId, preserve, id) {
  assertFileFolder(project, parentId);
  const folders = structuredClone(project.fileFolders || []),
    paths = [];
  const names = new Map();
  for (const file of files) {
    const parts = String(file.relativePath || file.name).split(/[\\/]/u);
    if (
      parts.length > 21 ||
      parts.some(
        (part, index) =>
          !part || part === '.' || part === '..' || (index < parts.length - 1 && part.length > 120) || Array.from(part).some(char => char.charCodeAt(0) < 32),
      ) ||
      parts.at(-1) !== file.name
    )
      throw new TypeError('Invalid import path (maximum 20 folders / 120 characters per name).');
    let folderId = parentId || null;
    if (preserve)
      for (const name of parts.slice(0, -1)) {
        let folder = folders.find(
          folder => !folder.archived && (folder.parentId || null) === folderId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        );
        if (!folder) {
          folder = { id: id(), name, parentId: folderId };
          folders.push(folder);
        }
        folderId = folder.id;
      }
    const key = JSON.stringify([folderId, file.name.toLocaleLowerCase()]);
    names.set(key, (names.get(key) || 0) + 1);
    paths.push(folderId);
  }
  validateProjectFileFolders({ fileFolders: folders });
  return {
    folders,
    paths,
    added: folders.length - (project.fileFolders || []).length,
    collisions: [...names.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
  };
}
