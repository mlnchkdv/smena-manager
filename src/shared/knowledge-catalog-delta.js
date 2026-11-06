export const NOTE_WRITE_FIELDS = [
  'title',
  'summary',
  'formatted_markdown',
  'category',
  'folderId',
  'tags',
  'typeId',
  'properties',
  'aliases',
  'tagAliases',
  'captureStatus',
  'assets',
  'materialTargets',
  'favorite',
  'sourceFormat',
  'sourceName',
  'restoreFromVersion',
  'restoreExpectedHash',
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function catalogDelta(before, next) {
  const delta = {};
  for (const field of ['knowledgeNotes', 'knowledgeFolders']) {
    const old = new Map(before[field].map(row => [row.id, row])),
      rows = next[field],
      ids = new Set(rows.map(row => row.id));
    const upsert = [];
    for (const row of rows) {
      const prior = old.get(row.id),
        patch = { id: row.id };
      for (const key of field === 'knowledgeNotes' ? NOTE_WRITE_FIELDS : Object.keys(row).filter(key => key !== 'id'))
        if (Object.hasOwn(row, key) && (!prior || !same(row[key], prior[key]))) patch[key] = row[key];
      if (Object.keys(patch).length > 1 || !prior) {
        if (field === 'knowledgeNotes' && prior) patch.bodyToken = row.bodyToken;
        upsert.push(patch);
      }
    }
    const remove = before[field].filter(row => !ids.has(row.id)).map(row => row.id);
    delta[field] = { upsert, remove };
    if (
      !same(
        before[field].map(row => row.id),
        rows.map(row => row.id),
      )
    )
      delta[field].order = rows.map(row => row.id);
  }
  return delta;
}

// Server acknowledgements contain canonical changed rows, not editable patches.
export function acknowledgeCatalog(input, ack) {
  const result = { ...input, revision: ack.revision, createdAt: ack.createdAt, updatedAt: ack.updatedAt };
  for (const field of ['knowledgeNotes', 'knowledgeFolders']) {
    const changes = new Map(ack.changes[field].map(row => [row.id, row]));
    result[field] = input[field].map(row => changes.get(row.id) || row);
  }
  return result;
}
