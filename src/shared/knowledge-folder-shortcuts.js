export const validFolderPins = value =>
  Array.isArray(value) &&
  value.length <= 20 &&
  new Set(value).size === value.length &&
  value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 180);
export function folderPins(raw, folders) {
  try {
    const value = JSON.parse(raw || '[]'),
      known = new Set(folders.map(f => f.id));
    return validFolderPins(value) ? value.filter(id => known.has(id)) : [];
  } catch {
    return [];
  }
}
export function folderDestinationLocation(state, folder, scroll = 0) {
  const locations = [
    { folder: state.folder || null, query: state.query || '', offset: state.offset || 0, scroll },
    ...(state.locations || []).filter(item => item.folder !== (state.folder || null)),
  ].slice(0, 50);
  const target = locations.find(item => item.folder === (folder || null));
  return { folder: folder || null, query: target?.query || '', offset: target?.offset || 0, returnScroll: target?.scroll || 0, locations };
}
