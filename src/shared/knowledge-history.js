const fields = ['title', 'summary', 'formatted_markdown', 'tags', 'category', 'folderId', 'typeId', 'properties'];
export const KNOWLEDGE_VERSION_FIELDS = {
  typeId: 'Type',
  properties: 'Properties',
  title: 'Note title',
  summary: 'Summary',
  formatted_markdown: 'Content',
  tags: 'Tags',
  category: 'Category',
  folderId: 'Folder',
};
const snapshot = note =>
  Object.fromEntries(fields.map(field => [field, note[field] ?? (field === 'tags' ? [] : field === 'properties' ? {} : field === 'typeId' ? 'note' : '')]));
export const knowledgeVersionFits = note => JSON.stringify(snapshot(note)).length <= 32000;
export function noteHistory(previous, next) {
  const history = Array.isArray(previous?.history) ? previous.history.slice(0, 5) : [];
  if (!previous || JSON.stringify(snapshot(previous)) === JSON.stringify(snapshot(next))) return history;
  // Preserve the start of an editing session across a burst of autosaves.
  if (!next.restoreFromVersion && history[0]?.editedBy === next.updatedBy && Date.now() - Number(history[0]?.savedAt || 0) < 120000) return history;
  const content = snapshot(previous);
  if (!knowledgeVersionFits(previous)) return history;
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
export function knowledgeVersionChanges(note, version, folders) {
  const current = snapshot(note);
  current.folderId ||= null;
  const restored = historyContent(version, folders);
  return {
    fields: fields.filter(field => JSON.stringify(current[field]) !== JSON.stringify(restored[field])),
    current,
    restored,
    missingFolder: Boolean(version.folderId && !folders.some(folder => folder.id === version.folderId)),
  };
}
// A bounded changed range, not a quadratic line-diff algorithm. The complete
// historical document remains readable separately below the comparison.
export function knowledgeTextComparison(before, after, limit = 80) {
  const left = String(before || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const right = String(after || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  let start = 0,
    leftEnd = left.length,
    rightEnd = right.length;
  while (start < leftEnd && start < rightEnd && left[start] === right[start]) start++;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
  }
  const removed = leftEnd - start,
    added = rightEnd - start;
  return {
    line: start + 1,
    removed,
    added,
    before: left.slice(start, Math.min(leftEnd, start + limit)).join('\n'),
    after: right.slice(start, Math.min(rightEnd, start + limit)).join('\n'),
    truncated: removed > limit || added > limit,
  };
}
