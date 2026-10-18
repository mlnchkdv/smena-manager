// Fill omitted optional fields only. Malformed non-null values remain visible to validation.
export function applyEntityDefaults(data) {
  const fill = (item, defaults) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    for (const [key, value] of Object.entries(defaults)) if (item[key] == null) item[key] = structuredClone(value);
  };
  for (const task of Array.isArray(data.tasks) ? data.tasks : []) {
    fill(task, { title: '', desc: '', status: 'todo', priority: 'none', subtasks: [], attachments: [], deps: [], labels: [] });
    for (const subtask of Array.isArray(task?.subtasks) ? task.subtasks : []) fill(subtask, { title: '', done: false });
  }
  for (const project of Array.isArray(data.projects) ? data.projects : [])
    fill(project, { name: '', desc: '', status: 'planning', members: [], perms: {}, milestones: [] });
  for (const comment of Array.isArray(data.comments) ? data.comments : []) fill(comment, { text: '', re: {} });
  return data;
}
