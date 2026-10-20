const fields = ['title', 'summary', 'formatted_markdown', 'tags', 'category', 'folderId'];
const snapshot = note => Object.fromEntries(fields.map(field => [field, note[field] ?? (field === 'tags' ? [] : '')]));
export function noteHistory(previous, next) {
  const history = Array.isArray(previous?.history) ? previous.history.slice(0, 5) : [];
  if (!previous || JSON.stringify(snapshot(previous)) === JSON.stringify(snapshot(next))) return history;
  // Preserve the start of an editing session across a burst of autosaves.
  if (!next.restoreFromVersion && history[0]?.editedBy === next.updatedBy && Date.now() - Number(history[0]?.savedAt || 0) < 120000) return history;
  const content = snapshot(previous);
  if (JSON.stringify(content).length > 32000) return history;
  const version = {
    id: `v-${Date.now()}-${String(previous.updatedAt || '').replace(/[^0-9]/g, '')}`,
    at: previous.updatedAt || new Date().toISOString(),
    by: previous.updatedBy || '',
    editedBy: next.updatedBy || '',
    savedAt: Date.now(),
    ...content,
  };
  const result = [version, ...history].slice(0, 5);
  while (JSON.stringify(result).length > 64000) result.pop();
  return result;
}
export function historyContent(version, folders) {
  const value = snapshot(version);
  if (!folders.some(folder => folder.id === value.folderId)) value.folderId = null;
  return value;
}
