// The reader follows the captured result page, not a newly sorted/recent list.
// Revalidate scope and existence on every step; never carry a page across users.
export function knowledgePreviewNavigation(context, { owner, workspace, notes = [], activeId } = {}) {
  if (!context || !owner || !workspace || context.owner !== owner || context.workspace !== workspace || !Array.isArray(context.ids)) return null;
  const known = new Set(notes.map(note => note.id));
  const ids = [...new Set(context.ids.filter(id => typeof id === 'string'))].slice(0, 60).filter(id => known.has(id));
  const index = ids.indexOf(activeId);
  if (index < 0) return null;
  return { index, total: ids.length, previous: ids[index - 1] || null, next: ids[index + 1] || null };
}
