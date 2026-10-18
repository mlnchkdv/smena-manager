import { canReadProject } from './project-access.js';

export function searchWorkspace(data, query, options = {}) {
  const result = { tasks: [], projects: [], people: [], files: [], comments: [], knowledge: [], bookmarks: [] };
  const q = String(query || '')
    .trim()
    .toLocaleLowerCase();
  if (!q) return result;
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const has = value =>
    String(value || '')
      .toLocaleLowerCase()
      .includes(q);
  const projects = new Map(
    (data.projects || [])
      .filter(project => !project.archived && canReadProject(project, data.me, options.role || 'editor'))
      .map(project => [project.id, project]),
  );
  const tasks = new Map((data.tasks || []).filter(task => !task.archived && projects.has(task.project)).map(task => [task.id, task]));
  const collect = (key, items, matches) => {
    for (const item of items || [])
      if (matches(item)) {
        result[key].push(item);
        if (result[key].length >= limit) break;
      }
  };
  collect('tasks', tasks.values(), task => has(task.title) || has(task.key) || has(String(task.desc || '').replace(/<[^>]+>/gu, '')));
  collect('projects', (data.projOrder || [...projects.keys()]).map(id => projects.get(id)).filter(Boolean), project => has(project.name) || has(project.desc));
  collect('people', data.members, member => !['removed', 'deactivated'].includes(member.status) && [member.name, member.email, member.title].some(has));
  collect('files', data.files, file => !file.archived && (!file.project || projects.has(file.project)) && has(file.name));
  collect('comments', data.comments, comment => tasks.has(comment.task) && has(comment.text));
  collect('knowledge', data.knowledgeNotes, note => has([note.title, note.summary, note.formatted_markdown, ...(note.tags || [])].join(' ')));
  collect('bookmarks', data.links, link => has([link.title, link.description, link.url, link.site_name, ...(link.tags || [])].join(' ')));
  return result;
}
