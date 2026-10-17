import { canReadProject } from '../shared/project-access.js';
import { workspaceMemberRole } from '../shared/workspace-access.js';

export function validateTaskTransitions(current, candidate) {
  const previous = new Map((current.tasks || []).map(task => [task.id, task]));
  const members = new Map((candidate.members || []).map(member => [member.id, member]));
  const projects = new Map((candidate.projects || []).map(project => [project.id, project]));
  let graphChanged = previous.size !== candidate.tasks.length;
  const invalid = code => {
    throw Object.assign(new TypeError('Task dependencies or assignee are invalid.'), { code, statusCode: 400 });
  };
  for (const task of candidate.tasks) {
    const before = previous.get(task.id);
    if (JSON.stringify(before?.deps || []) !== JSON.stringify(task.deps || [])) graphChanged = true;
    if (task.assignee && (!before || before.assignee !== task.assignee || before.project !== task.project)) {
      const member = members.get(task.assignee);
      if (!member || ['deactivated', 'removed'].includes(member.status)) invalid('ASSIGNEE_UNAVAILABLE');
      const project = projects.get(task.project);
      if (project && !canReadProject(project, member.id, workspaceMemberRole(member))) invalid('ASSIGNEE_PROJECT_ACCESS');
    }
  }
  if (!graphChanged) return;
  const indegree = new Map(candidate.tasks.map(task => [task.id, 0]));
  const edges = new Map();
  for (const task of candidate.tasks)
    for (const dependency of task.deps || []) {
      if (!indegree.has(dependency) || dependency === task.id) invalid('TASK_DEPENDENCY_INVALID');
      indegree.set(task.id, indegree.get(task.id) + 1);
      if (!edges.has(dependency)) edges.set(dependency, []);
      edges.get(dependency).push(task.id);
    }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  for (let index = 0; index < ready.length; index += 1)
    for (const id of edges.get(ready[index]) || []) {
      indegree.set(id, indegree.get(id) - 1);
      if (!indegree.get(id)) ready.push(id);
    }
  if (ready.length !== candidate.tasks.length) invalid('TASK_DEPENDENCY_CYCLE');
}

export function assignCanonicalTaskKeys(current, candidate) {
  const existing = new Map((current.tasks || []).map(task => [task.id, task]));
  for (const project of candidate.projects || []) {
    const before = current.projects?.find(item => item.id === project.id);
    if (before?.key) project.key = before.key;
    let sequence = Math.max(Number(before?.seq) || 0, Number(project.seq) || 0);
    for (const task of current.tasks || [])
      if (task.project === project.id) {
        const suffix = /-(\d+)$/u.exec(task.key || '');
        if (suffix) sequence = Math.max(sequence, Number(suffix[1]));
      }
    for (const task of candidate.tasks || []) {
      if (task.project !== project.id) continue;
      if (existing.get(task.id)?.key) task.key = existing.get(task.id).key;
      else task.key = `${project.key || 'TASK'}-${++sequence}`;
    }
    project.seq = sequence;
  }
  return candidate;
}
