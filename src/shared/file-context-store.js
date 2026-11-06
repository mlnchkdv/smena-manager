const text = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');
const integer = (value, maximum) => (Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0);
export const fileContextKey = (user, workspace, project = '') => 'smena.files.context.v1:' + JSON.stringify([user, workspace, project]);
export function normalizeFileContext(value = {}) {
  return {
    fileQ: text(value.fileQ, 500),
    fileProject: text(value.fileProject, 180) || 'all',
    fileFolder: text(value.fileFolder, 180) || null,
    fileType: text(value.fileType, 40) || 'all',
    fileRecursive: value.fileRecursive === true,
    fileUploadProject: text(value.fileUploadProject, 180),
    fileFolderOffset: integer(value.fileFolderOffset, 1000000),
    fileFolderQuery: text(value.fileFolderQuery, 500),
    fileSelectedPreset: text(value.fileSelectedPreset, 180),
    page: integer(value.page, 1000000),
    scroll: integer(value.scroll, 10000000),
    anchor:
      value.anchor && typeof value.anchor.id === 'string'
        ? { id: text(value.anchor.id, 180), offset: Math.max(-1000, Math.min(1000, Number(value.anchor.offset) || 0)) }
        : null,
  };
}
export function readFileContext(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? normalizeFileContext(value) : null;
  } catch {
    return null;
  }
}
export function writeFileContext(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(normalizeFileContext(value)));
  } catch {
    /* Optional per-tab state must not block files. */
  }
}
