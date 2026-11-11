const fields = [
  'title',
  'summary',
  'formatted_markdown',
  'tags',
  'category',
  'folderId',
  'typeId',
  'properties',
  'aliases',
  'tagAliases',
  'captureStatus',
  'assets',
  'materialTargets',
];
export const KNOWLEDGE_VERSION_FIELDS = {
  typeId: 'Type',
  assets: 'Linked assets',
  materialTargets: 'Imported links',
  captureStatus: 'Capture status',
  aliases: 'Aliases',
  tagAliases: 'Tag aliases',
  properties: 'Properties',
  title: 'Note title',
  summary: 'Summary',
  formatted_markdown: 'Content',
  tags: 'Tags',
  category: 'Category',
  folderId: 'Folder',
};
export const knowledgeSnapshot = note =>
  Object.fromEntries(
    fields.map(field => [
      field,
      note[field] ??
        (['tags', 'aliases', 'tagAliases'].includes(field)
          ? []
          : ['properties', 'assets', 'materialTargets'].includes(field)
            ? {}
            : field === 'typeId'
              ? 'note'
              : ''),
    ]),
  );
const snapshot = knowledgeSnapshot;
export const KNOWLEDGE_HISTORY_LIMIT = 20;
export const KNOWLEDGE_VERSION_MAX_BYTES = 8 * 1024 * 1024;
export const KNOWLEDGE_VERSION_STORE_MAX_BYTES = 256 * 1024 * 1024;
export const externalKnowledgeVersion = version => version?.contentRef?.kind === 'knowledge-version-v1' || version?.remote === true;
export const knowledgeInlineVersionFits = note => JSON.stringify(snapshot(note)).length <= 32000;
export const knowledgeVersionFits = note => new TextEncoder().encode(JSON.stringify(snapshot(note))).length <= KNOWLEDGE_VERSION_MAX_BYTES - 1024;
export function noteHistory(previous, next) {
  const history = Array.isArray(previous?.history) ? previous.history.slice(0, 5) : [];
  if (!previous || JSON.stringify(snapshot(previous)) === JSON.stringify(snapshot(next))) return history;
  // Preserve the start of an editing session across a burst of autosaves.
  if (!next.restoreFromVersion && history[0]?.editedBy === next.updatedBy && Date.now() - Number(history[0]?.savedAt || 0) < 120000) return history;
  const content = snapshot(previous);
  if (!knowledgeInlineVersionFits(previous)) return history;
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
    fields: fields.filter(field =>
      typeof current[field] === 'string' && typeof restored[field] === 'string'
        ? current[field] !== restored[field]
        : JSON.stringify(current[field]) !== JSON.stringify(restored[field]),
    ),
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
  const beforeText = left.slice(start, Math.min(leftEnd, start + limit)).join('\n');
  const afterText = right.slice(start, Math.min(rightEnd, start + limit)).join('\n');
  return {
    line: start + 1,
    removed,
    added,
    before: beforeText.slice(0, 12000),
    after: afterText.slice(0, 12000),
    truncated: removed > limit || added > limit || beforeText.length > 12000 || afterText.length > 12000,
  };
}
