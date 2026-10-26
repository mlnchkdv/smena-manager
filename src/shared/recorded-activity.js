// Legacy `last` fields are relative demo counters, not timestamps or presence.
export function recordedActivityIndex(data, readableProjects, now = Date.now()) {
  const projects = new Map();
  const members = new Map();
  const allowed = new Set(readableProjects.map(project => project.id));
  const taskProjects = new Map((data.tasks || []).map(task => [task.id, task.project]));
  const time = raw => {
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Date.parse(raw) : NaN;
    return Number.isFinite(value) && value >= Date.UTC(2000, 0, 1) && value <= now + 60_000 ? value : null;
  };
  const add = (raw, project, by) => {
    if (project && !allowed.has(project)) return;
    const at = time(raw);
    if (!at) return;
    if (project) projects.set(project, Math.max(projects.get(project) || 0, at));
    if (by) members.set(by, Math.max(members.get(by) || 0, at));
  };
  for (const project of readableProjects) for (const field of ['createdAt', 'updatedAt', 'lastActivityAt']) add(project[field], project.id);
  for (const task of data.tasks || []) {
    if (!allowed.has(task.project)) continue;
    add(task.created, task.project);
    add(task.updated, task.project);
  }
  for (const event of data.activity || []) {
    const project = event.project || taskProjects.get(event.task);
    if (event.task && !project) continue;
    add(event.at, project, event.by);
  }
  for (const comment of data.comments || []) {
    const project = taskProjects.get(comment.task);
    if (project) add(comment.at, project, comment.by);
  }
  return { projects, members };
}

export function compareProjectActivity(a, b, times, locale = 'en') {
  return (
    (times.get(b.id) || 0) - (times.get(a.id) || 0) ||
    String(a.name || '').localeCompare(String(b.name || ''), locale, { sensitivity: 'base' }) ||
    String(a.id).localeCompare(String(b.id))
  );
}
