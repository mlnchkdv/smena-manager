export function toggleKnowledgePageSelection(selectedIds, pageIds) {
  const selected = new Set(selectedIds);
  const page = new Set(pageIds);
  const remove = page.size > 0 && [...page].every(id => selected.has(id));
  for (const id of page) remove ? selected.delete(id) : selected.add(id);
  return [...selected];
}
