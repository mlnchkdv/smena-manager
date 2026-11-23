const objects = {
  project: ['project', 'projects'],
  task: ['task', 'tasks'],
  file: ['file', 'files'],
  note: ['note', 'knowledgeNotes'],
  bookmark: ['link', 'links'],
};
export function workspaceAuditEvents(before, after, actorId, at) {
  const events = [];
  if (!actorId) return events;
  const members = new Map((before.members || []).map(member => [member.id, member]));
  for (const member of after.members || []) {
    const previous = members.get(member.id);
    if (previous && member.role !== previous.role)
      events.push({ kind: 'member', targetId: member.id, actorId, event: 'role', at, from: previous.role, to: member.role });
  }
  const oldTrash = new Map((before.trash || []).map(entry => [entry.id, entry]));
  const remaining = new Set();
  function log(entry, event) {
    const [field, collection] = objects[entry.kind] || [];
    const id = entry.data?.[field]?.id;
    if (!id || (event === 'restored' && !after[collection]?.some(row => row.id === id))) return;
    events.push({ actorId, at, kind: entry.kind, targetId: id, event });
  }
  for (const entry of after.trash || []) {
    remaining.add(entry.id);
    if (!oldTrash.has(entry.id)) log(entry, 'trashed');
  }
  for (const [id, entry] of oldTrash) if (!remaining.has(id)) log(entry, 'restored');
  return events;
}
