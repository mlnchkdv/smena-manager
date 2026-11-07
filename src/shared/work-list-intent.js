const DAY = 86400000;

export function completedWithin(task, days, now = Date.now()) {
  const at = Number(task?.completedAt);
  const age = now - at;
  return task?.status === 'done' && Number.isFinite(at) && at > 0 && age >= 0 && age <= Number(days) * DAY;
}

// A dashboard count opens a new query, while retaining the user's column layout.
export function applyWorkListIntent(view, { kind = 'all', project, assignee } = {}) {
  const filters = [];
  if (['open', 'overdue', 'unassigned', 'week'].includes(kind)) filters.push({ f: 'status', op: 'not', v: ['done'] });
  if (kind === 'done') filters.push({ f: 'status', op: 'is', v: ['done'] }, { f: 'completed', op: 'is', v: ['7'] });
  if (kind === 'overdue' || kind === 'week') filters.push({ f: 'due', op: 'is', v: [kind] });
  if (kind === 'unassigned') filters.push({ f: 'assignee', op: 'is', v: ['none'] });
  else if (assignee) filters.push({ f: 'assignee', op: 'is', v: [assignee] });
  if (project) filters.push({ f: 'project', op: 'is', v: [project] });
  Object.assign(view, { q: '', filters, mode: 'list', showDone: true });
  return view;
}
