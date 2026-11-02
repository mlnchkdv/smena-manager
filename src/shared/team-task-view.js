/** Inputs must already be filtered by the caller's project access. */
export function teamTaskView(tasks, memberIds, projectIds, scope = 'assigned', page = 0) {
  const members = new Set(memberIds),
    projects = new Set(projectIds);
  const rows = tasks.filter(t => t.status !== 'done' && (scope === 'projects' ? projects.has(t.project) : members.has(t.assignee)));
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(pages - 1, Math.max(0, Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 0));
  return {
    rows: rows.slice(current * 8, current * 8 + 8),
    total: rows.length,
    pages,
    page: current,
    start: rows.length ? current * 8 + 1 : 0,
    end: Math.min(rows.length, current * 8 + 8),
  };
}
