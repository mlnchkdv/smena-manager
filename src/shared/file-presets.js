const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
export function filePresetFilters(ui) {
  return {
    project: ui.fileProject || 'all',
    folder: ui.fileFolder || null,
    query: String(ui.fileQ || '').slice(0, 200),
    type: ui.fileType || 'all',
    sort: ui.fileSort || 'date',
    recursive: Boolean(ui.fileRecursive),
  };
}
export function filePresetModified(preset, filters) {
  return Boolean(preset && ['project', 'folder', 'query', 'type', 'sort', 'recursive'].some(key => preset[key] !== filters[key]));
}
export function reorderFilePreset(presets, id, direction) {
  const next = [...presets],
    index = next.findIndex(item => item.id === id),
    target = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function normalizeFilePresets(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.slice(0, 12).flatMap(preset => {
    const id = text(preset?.id, 180),
      name = text(preset?.name, 60).trim();
    if (!id || !name || ids.has(id)) return [];
    ids.add(id);
    return [
      {
        id,
        name,
        project: text(preset.project, 180) || 'all',
        folder: text(preset.folder, 180) || null,
        query: text(preset.query, 200),
        type: text(preset.type, 30) || 'all',
        sort: ['date', 'name', 'size', 'project'].includes(preset.sort) ? preset.sort : 'date',
        recursive: preset.recursive === true,
      },
    ];
  });
}
export function readFilePresets(storage, key) {
  try {
    return normalizeFilePresets(JSON.parse(storage?.getItem(`${key}:filters`) || '[]'));
  } catch {
    return [];
  }
}
export function writeFilePresets(storage, key, value) {
  try {
    storage.setItem(`${key}:filters`, JSON.stringify(normalizeFilePresets(value)));
    return true;
  } catch {
    return false;
  }
}
