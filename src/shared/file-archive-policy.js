import { canReadProject } from './project-access.js';
import { createFileIndex } from './file-index.js';
export const FILE_ZIP_MAX_FILES = 100;
export const FILE_ZIP_MAX_BYTES = 50 * 1024 * 1024;
export const ZIP_LIMIT_MESSAGE = 'A ZIP can contain up to 100 files and 50 MB. Select a smaller batch.';
export const STREAM_ZIP_POLICY = {
  maxFiles: 500,
  maxBytes: 250 * 1024 * 1024,
  limitMessage: 'A streamed ZIP can contain up to 500 files and 250 MB. Select a smaller batch.',
};
export function archiveSelectionIssue(files, { maxFiles = FILE_ZIP_MAX_FILES, maxBytes = FILE_ZIP_MAX_BYTES, limitMessage = ZIP_LIMIT_MESSAGE } = {}) {
  if (!files.length) return 'Select files to download.';
  if (files.length > maxFiles || files.reduce((sum, file) => sum + Math.max(0, Number(file.bytes) || 0), 0) > maxBytes) return limitMessage;
  if (files.some(file => !file.storageName)) return 'Some selected files have no stored content. Remove them from the selection.';
  return '';
}
export function safeArchiveSegment(value) {
  // These characters are intentionally removed from exported ZIP entry names.
  let name = String(value || '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/^[. ]+|[. ]+$/g, '');
  if (!name) name = 'untitled';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  const characters = Array.from(name);
  if (characters.length <= 100) return name;
  const extension = name.match(/\.[^.]{1,16}$/u)?.[0] || '';
  return characters.slice(0, 100 - Array.from(extension).length).join('') + extension;
}
export function createFileArchivePlan(data, ids, role, limits) {
  const selected = new Set(ids);
  const files = (data.files || []).filter(file => selected.has(file.id));
  if (!selected.size || files.length !== selected.size) throw Error('The selected files changed. Select them again.');
  const issue = archiveSelectionIssue(files, limits);
  if (issue) throw Error(issue);
  const projects = (data.projects || []).filter(project => !project.archived && canReadProject(project, data.me, role));
  const index = createFileIndex({ ...data, files }, projects);
  if (index.files.length !== files.length) throw Error('You do not have access to this file.');
  const used = new Set();
  const directories = new Map();
  const unique = (parent, raw) => {
    const segment = safeArchiveSegment(raw);
    let name = segment,
      number = 1;
    const extension = segment.match(/\.[^.]{1,16}$/u)?.[0] || '';
    const stem = extension ? segment.slice(0, -extension.length) : segment;
    while (used.has(`${parent}${name}`.toLocaleLowerCase())) name = `${stem} (${++number})${extension}`;
    const path = `${parent}${name}`;
    used.add(path.toLocaleLowerCase());
    return path;
  };
  const directory = (identity, parent, name) => {
    if (!directories.has(identity)) directories.set(identity, `${unique(parent, name)}/`);
    return directories.get(identity);
  };
  return files.map(file => {
    const project = index.projectMap.get(file.project);
    let parent = directory(JSON.stringify([project.id]), '', project.name);
    for (const folder of index.folderPath(project.id, file.folderId)) parent = directory(JSON.stringify([project.id, folder.id]), parent, folder.name);
    return { file: { ...file }, path: unique(parent, file.name) };
  });
}
