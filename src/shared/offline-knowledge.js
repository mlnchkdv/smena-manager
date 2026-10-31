export function offlineEditPlan(entries, data, owner, workspace) {
  const ready = [],
    conflicts = [];
  for (const entry of entries) {
    if (entry.kind && entry.kind !== 'note') continue;
    if (entry.owner !== owner || entry.workspace !== workspace || !entry.pending) continue;
    const note = (data.knowledgeNotes || []).find(n => n.id === entry.id);
    if (!note || note.formatted_markdown !== entry.base.formatted_markdown) conflicts.push(entry);
    else ready.push(entry);
  }
  return { ready, conflicts };
}
