// Bounded operational receipts, committed with task changes in the canonical
// workspace CAS. Historical receipts are not a queue or permission to replay.
export const AUTOMATION_HISTORY_LIMITS = Object.freeze({ perProject: 20, workspaceBytes: 512 * 1024, taskSamples: 3 });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const keys = ['id', 'at', 'actorId', 'sourceRevision', 'revision', 'programHash', 'tasks', 'matchedTasks', 'assignments', 'noops'];
const projects = data => [
  ...(data.projects || []),
  ...(data.trash || []).filter(item => item.kind === 'project' && item.data?.project).map(item => item.data.project),
];
const bytes = rows => Buffer.byteLength(JSON.stringify(rows), 'utf8');
const invalid = () => Object.assign(new TypeError('Stored automation receipts are invalid.'), { code: 'AUTOMATION_HISTORY_INTEGRITY', statusCode: 503 });
export function validAutomationRun(run) {
  return !!(
    record(run) &&
    Object.keys(run).length === keys.length &&
    Object.keys(run).every(key => keys.includes(key)) &&
    hash(run.id) &&
    hash(run.programHash) &&
    identity(run.actorId) &&
    typeof run.at === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(run.at) &&
    Number.isFinite(Date.parse(run.at)) &&
    new Date(run.at).toISOString() === run.at &&
    count(run.sourceRevision, Number.MAX_SAFE_INTEGER - 1) &&
    run.revision === run.sourceRevision + 1 &&
    count(run.matchedTasks, 100) &&
    run.matchedTasks > 0 &&
    count(run.assignments, 200) &&
    count(run.noops, run.matchedTasks) &&
    run.assignments >= run.matchedTasks - run.noops &&
    run.assignments <= 3 * (run.matchedTasks - run.noops) &&
    Array.isArray(run.tasks) &&
    run.tasks.length === Math.min(run.matchedTasks, AUTOMATION_HISTORY_LIMITS.taskSamples) &&
    new Set(run.tasks).size === run.tasks.length &&
    run.tasks.every(identity)
  );
}
export function validateAutomationHistory(data) {
  let total = 0;
  for (const project of projects(data)) {
    if (project.automationHistory == null) continue;
    const rows = project.automationHistory;
    if (
      !Array.isArray(rows) ||
      rows.length > AUTOMATION_HISTORY_LIMITS.perProject ||
      !rows.every(validAutomationRun) ||
      new Set(rows.map(row => row.id)).size !== rows.length
    )
      throw invalid();
    total += bytes(rows);
    if (total > AUTOMATION_HISTORY_LIMITS.workspaceBytes) throw invalid();
  }
  return data;
}
export function appendAutomationRuns(candidate, additions) {
  const next = {
    ...candidate,
    projects: candidate.projects.map(project => ({ ...project })),
    ...(candidate.trash
      ? {
          trash: candidate.trash.map(item =>
            item.kind === 'project' && item.data?.project ? { ...item, data: { ...item.data, project: { ...item.data.project } } } : item,
          ),
        }
      : {}),
  };
  for (const project of next.projects) {
    const run = additions.get(project.id);
    if (!run) continue;
    if (!validAutomationRun(run) || project.automationHistory?.some(row => row.id === run.id)) throw invalid();
    project.automationHistory = [run, ...(project.automationHistory || [])].slice(0, AUTOMATION_HISTORY_LIMITS.perProject);
  }
  const all = projects(next).filter(project => Array.isArray(project.automationHistory));
  let total = all.reduce((sum, project) => sum + bytes(project.automationHistory), 0);
  if (total > AUTOMATION_HISTORY_LIMITS.workspaceBytes) {
    const oldest = all
      .flatMap(project => project.automationHistory.map(run => ({ project, run })))
      .sort((a, b) => (a.run.at < b.run.at ? -1 : a.run.at > b.run.at ? 1 : a.run.id < b.run.id ? -1 : 1));
    for (const { project, run } of oldest) {
      if (total <= AUTOMATION_HISTORY_LIMITS.workspaceBytes) break;
      if (additions.get(project.id)?.id === run.id) continue;
      const before = bytes(project.automationHistory);
      project.automationHistory = project.automationHistory.filter(row => row.id !== run.id);
      total += bytes(project.automationHistory) - before;
    }
  }
  return validateAutomationHistory(next);
}
