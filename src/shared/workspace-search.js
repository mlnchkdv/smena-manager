import { canReadProject } from './project-access.js';
import { textMatcher } from './search-query.js';

export function searchWorkspace(data, query, options = {}) {
  const result = { tasks: [], projects: [], people: [], files: [], comments: [], knowledge: [], bookmarks: [] };
  const q = String(query || '')
    .trim()
    .toLocaleLowerCase();
  if (!q) return result;
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const has = textMatcher(q);
  const projects = new Map(
    (data.projects || [])
      .filter(project => !project.archived && canReadProject(project, data.me, options.role || 'editor'))
      .map(project => [project.id, project]),
  );
  const tasks = new Map((data.tasks || []).filter(task => !task.archived && projects.has(task.project)).map(task => [task.id, task]));
  const collect = (key, items, matches) => {
    const source = [...(items || [])];
    let count = 0;
    let offset = Math.max(0, Math.floor((Number(options.offsets?.[key]) || 0) / limit) * limit);
    for (const item of source)
      if (matches(item)) {
        if (count >= offset && result[key].length < limit) result[key].push(item);
        count++;
      }
    if (offset >= count && count) {
      offset = Math.floor((count - 1) / limit) * limit;
      let i = 0;
      for (const item of source) if (matches(item) && i++ >= offset && result[key].length < limit) result[key].push(item);
    }
    if (options.totals) options.totals[key] = count;
    if (options.offsets) options.offsets[key] = offset;
  };
  collect('tasks', tasks.values(), task => has([task.title, task.key, String(task.desc || '').replace(/<[^>]+>/gu, '')].join(' ')));
  collect('projects', (data.projOrder || [...projects.keys()]).map(id => projects.get(id)).filter(Boolean), project =>
    has([project.name, project.desc].join(' ')),
  );
  collect('people', data.members, member => !['removed', 'deactivated'].includes(member.status) && has([member.name, member.email, member.title].join(' ')));
  collect('files', data.files, file => !file.archived && (!file.project || projects.has(file.project)) && has(file.name));
  collect('comments', data.comments, comment => tasks.has(comment.task) && has(comment.text));
  collect('knowledge', data.knowledgeNotes, note => has([note.title, note.summary, note.formatted_markdown, ...(note.tags || [])].join(' ')));
  collect('bookmarks', data.links, link => has([link.title, link.description, link.url, link.site_name, ...(link.tags || [])].join(' ')));
  return result;
}
