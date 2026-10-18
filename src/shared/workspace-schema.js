const OBJECT_ARRAY_FIELDS = [
  'workspaces',
  'members',
  'projects',
  'tasks',
  'comments',
  'knowledgeNotes',
  'knowledgeFolders',
  'links',
  'linkFolders',
  'files',
  'activity',
  'notifs',
  'events',
  'savedViews',
  'sessions',
  'invoices',
  'trash',
];
const STRING_ARRAY_FIELDS = ['projOrder', 'recentSearches'];
const OBJECT_FIELDS = ['workspace', 'ws', 'notifPrefs'];

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class WorkspaceValidationError extends TypeError {
  constructor(fields) {
    super(`Workspace data has an invalid structure in: ${fields.join(', ')}.`);
    this.name = 'WorkspaceValidationError';
    this.statusCode = 400;
    this.code = 'WORKSPACE_INVALID';
    this.fields = fields;
  }
}

export function validateWorkspaceData(value) {
  if (!isObject(value)) throw new WorkspaceValidationError(['workspace']);
  const invalid = [];
  for (const field of OBJECT_ARRAY_FIELDS) {
    const collection = value[field];
    if (!Array.isArray(collection) || collection.some(item => !isObject(item))) invalid.push(field);
  }
  for (const field of STRING_ARRAY_FIELDS) {
    const collection = value[field];
    if (!Array.isArray(collection) || collection.some(item => typeof item !== 'string')) invalid.push(field);
  }
  if (value.teams != null && (!Array.isArray(value.teams) || value.teams.some(item => !isObject(item)))) invalid.push('teams');
  for (const field of OBJECT_FIELDS) {
    if (value[field] != null && !isObject(value[field])) invalid.push(field);
  }
  if (value.me != null && typeof value.me !== 'string') invalid.push('me');
  if (value.tfa != null && typeof value.tfa !== 'boolean') invalid.push('tfa');
  for (const field of [...OBJECT_ARRAY_FIELDS, 'teams']) {
    if (!Array.isArray(value[field])) continue;
    const ids = value[field].map(item => item?.id);
    if (ids.some(id => typeof id !== 'string' || !/^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(id)) || new Set(ids).size !== ids.length) invalid.push(`${field}.id`);
  }
  const projectIds = new Set((Array.isArray(value.projects) ? value.projects : []).map(item => item?.id));
  const taskIds = new Set((Array.isArray(value.tasks) ? value.tasks : []).map(item => item?.id));
  const validDate = date => {
    if (date == null || date === '') return true;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  for (const task of Array.isArray(value.tasks) ? value.tasks : []) {
    if (!isObject(task)) continue;
    if (task.project != null && !projectIds.has(task.project)) invalid.push('tasks.project');
    if (task.status != null && !['backlog', 'todo', 'progress', 'review', 'done'].includes(task.status)) invalid.push('tasks.status');
    for (const field of ['subtasks', 'attachments', 'deps', 'labels']) if (task[field] != null && !Array.isArray(task[field])) invalid.push(`tasks.${field}`);
    if (!validDate(task.due) || !validDate(task.start)) invalid.push('tasks.date');
    if (Array.isArray(task.deps) && task.deps.some(id => id === task.id || !taskIds.has(id))) invalid.push('tasks.deps');
    if (task.title != null && (typeof task.title !== 'string' || task.title.length > 20_000)) invalid.push('tasks.title');
    if (task.desc != null && typeof task.desc !== 'string') invalid.push('tasks.desc');
  }
  for (const project of Array.isArray(value.projects) ? value.projects : []) {
    if (!isObject(project)) continue;
    if (project.members != null && !Array.isArray(project.members)) invalid.push('projects.members');
    if (project.members?.some?.(id => typeof id !== 'string')) invalid.push('projects.members');
    if (project.key != null && (typeof project.key !== 'string' || !/^[\p{L}\p{N}_-]{1,32}$/u.test(project.key))) invalid.push('projects.key');
    if (project.milestones != null && (!Array.isArray(project.milestones) || project.milestones.some(item => !isObject(item) || !validDate(item.date))))
      invalid.push('projects.milestones');
  }
  for (const comment of Array.isArray(value.comments) ? value.comments : []) {
    if (comment?.task != null && !taskIds.has(comment.task)) invalid.push('comments.task');
    if (comment?.text != null && typeof comment.text !== 'string') invalid.push('comments.text');
    if (
      comment?.mentions != null &&
      (!Array.isArray(comment.mentions) ||
        comment.mentions.length > 100 ||
        comment.mentions.some(
          ref =>
            !isObject(ref) || typeof ref.id !== 'string' || typeof ref.label !== 'string' || ref.label.length > 300 || !['member', 'group'].includes(ref.kind),
        ))
    )
      invalid.push('comments.mentions');
    for (const field of ['re', 'reactions']) {
      if (
        comment?.[field] != null &&
        (!isObject(comment[field]) ||
          Object.entries(comment[field]).some(
            ([emoji, members]) =>
              !/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]{1,16}$/u.test(emoji) ||
              !Array.isArray(members) ||
              members.some(id => typeof id !== 'string'),
          ))
      )
        invalid.push(`comments.${field}`);
    }
  }
  for (const member of Array.isArray(value.members) ? value.members : [])
    if (member?.c != null && (typeof member.c !== 'string' || !/^#[\da-f]{6}$/iu.test(member.c))) invalid.push('members.c');
  if (invalid.length) throw new WorkspaceValidationError([...new Set(invalid)]);
  return value;
}

export function validateDocumentInput(name, value) {
  const fields = name === 'knowledge' ? ['knowledgeNotes', 'knowledgeFolders'] : name === 'bookmarks' ? ['links', 'linkFolders'] : [];
  if (!fields.length || !isObject(value)) throw new WorkspaceValidationError([name]);
  const invalid = fields.filter(
    field =>
      !Array.isArray(value[field]) ||
      value[field].some(item => !isObject(item) || typeof item.id !== 'string' || !/^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(item.id)),
  );
  for (const field of fields) if (Array.isArray(value[field]) && new Set(value[field].map(item => item.id)).size !== value[field].length) invalid.push(field);
  if (invalid.length) throw new WorkspaceValidationError([...new Set(invalid)]);
  return value;
}
