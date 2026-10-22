export function normalizeFileView(value = {}) {
  return {
    view: value?.view === 'list' ? 'list' : 'grid',
    sort: ['date', 'name', 'size', 'project'].includes(value?.sort) ? value.sort : 'date',
    pageSize: [25, 50, 100].includes(value?.pageSize) ? value.pageSize : 100,
    folderLayout: value?.folderLayout === 'compact' ? 'compact' : 'tiles',
    foldersCollapsed: value?.foldersCollapsed === true,
  };
}
export const fileViewKey = (user, workspace) => `smena.files.ui.v1:${JSON.stringify([String(user || 'anonymous'), String(workspace || '')])}`;
export function readFileView(storage, key) {
  try {
    return normalizeFileView(JSON.parse(storage.getItem(key) || '{}'));
  } catch {
    return normalizeFileView();
  }
}
export function writeFileView(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(normalizeFileView(value)));
    return true;
  } catch {
    return false;
  }
}
