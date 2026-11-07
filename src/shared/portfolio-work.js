// Callers supply readable projects. Reject hidden/orphan task references again here.
export function portfolioWork(projects, tasks, today) {
  const rows = new Map(projects.map(project => [project.id, { project, total: 0, done: 0, open: 0, overdue: 0, unassigned: 0, next: null }]));
  const workload = new Map();
  for (const task of tasks) {
    const row = rows.get(task.project);
    if (!row) continue;
    row.total++;
    if (task.status === 'done') row.done++;
    else {
      row.open++;
      if (task.due && task.due < today) row.overdue++;
      if (!task.assignee) row.unassigned++;
      else workload.set(task.assignee, (workload.get(task.assignee) || 0) + 1);
    }
  }
  for (const row of rows.values()) {
    row.progress = row.total ? Math.round((row.done / row.total) * 100) : 0;
    row.next = (row.project.milestones || [])
      .filter(m => !m.completed && /^\d{4}-\d{2}-\d{2}$/.test(m.date || ''))
      .reduce((earliest, m) => (!earliest || m.date < earliest.date ? m : earliest), null);
    row.attention = row.overdue > 0 || row.unassigned > 0 || row.project.status === 'risk' || Boolean(row.next && row.next.date < today);
  }
  const ordered = [...rows.values()].sort(
    (a, b) =>
      Number(b.attention) - Number(a.attention) ||
      b.overdue - a.overdue ||
      (a.next?.date || '9999').localeCompare(b.next?.date || '9999') ||
      String(a.project.name).localeCompare(String(b.project.name)) ||
      a.project.id.localeCompare(b.project.id),
  );
  return {
    rows: ordered,
    workload,
    open: ordered.reduce((n, r) => n + r.open, 0),
    overdue: ordered.reduce((n, r) => n + r.overdue, 0),
    unassigned: ordered.reduce((n, r) => n + r.unassigned, 0),
  };
}

export function findPortfolioRows(rows, query = '', attention = false, memberName = () => '') {
  const terms = String(query).normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(
    row =>
      (!attention || row.attention) &&
      (!terms.length ||
        terms.every(term =>
          [row.project.name, memberName(row.project.lead), row.next?.name].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase().includes(term),
        )),
  );
}
