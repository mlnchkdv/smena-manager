import sanitizeHtml from 'sanitize-html';

export function sanitizeDescription(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h2', 'h3', 'h4', 'a'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
  });
}

export function sanitizeWorkspaceContent(data) {
  const next = structuredClone(data);
  const cleanDescription = task => {
    if (task && Object.hasOwn(task, 'desc')) task.desc = sanitizeDescription(task.desc);
  };
  const cleanTask = task => {
    cleanDescription(task);
    for (const subtask of Array.isArray(task?.subtasks) ? task.subtasks : []) cleanDescription(subtask);
  };
  (next.tasks || []).forEach(cleanTask);
  for (const entry of next.trash || []) {
    cleanTask(entry.data?.task);
    (entry.data?.tasks || []).forEach(cleanTask);
  }
  return next;
}
