import { ENTITY_COLLECTIONS, RELATION_TYPES } from './relations.js';
import { assertFileFolder, validateProjectFileFolders } from './file-organization.js';
import { projectImageData } from './project-appearance.js';
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
const validIdentity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const validEntityArray = items =>
  Array.isArray(items) && items.every(item => isObject(item) && validIdentity(item.id)) && new Set(items.map(item => item.id)).size === items.length;

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
  if (value.relations != null) {
    if (!validEntityArray(value.relations) || value.relations.length > 20000) invalid.push('relations');
    else
      for (const relation of value.relations) {
        const validEndpoint = key =>
          typeof key === 'string' && Object.keys(ENTITY_COLLECTIONS).some(kind => key.startsWith(`${kind}:`) && validIdentity(key.slice(kind.length + 1)));
        if (!validEndpoint(relation.from) || !validEndpoint(relation.to) || relation.from === relation.to || !Object.hasOwn(RELATION_TYPES, relation.type))
          invalid.push('relations.endpoint');
        for (const field of ['createdAt', 'deletedAt'])
          if (relation[field] != null && (typeof relation[field] !== 'string' || !Number.isFinite(Date.parse(relation[field]))))
            invalid.push(`relations.${field}`);
      }
  }
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
    if (Object.hasOwn(value, field) && !isObject(value[field])) invalid.push(field);
  }
  if (value.me != null && typeof value.me !== 'string') invalid.push('me');
  if (value.tfa != null && typeof value.tfa !== 'boolean') invalid.push('tfa');
  if (isObject(value.ws)) {
    if (value.ws.c != null && (typeof value.ws.c !== 'string' || !/^#[\da-f]{6}$/iu.test(value.ws.c))) invalid.push('ws.c');
    for (const field of ['name', 'url'])
      if (value.ws[field] != null && (typeof value.ws[field] !== 'string' || value.ws[field].length > 500)) invalid.push(`ws.${field}`);
    if (
      value.ws.permissions != null &&
      (!isObject(value.ws.permissions) || (value.ws.permissions.createProjects != null && typeof value.ws.permissions.createProjects !== 'boolean'))
    )
      invalid.push('ws.permissions');
  }
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
    if (task.priority != null && !['none', 'urgent', 'high', 'medium', 'low'].includes(task.priority)) invalid.push('tasks.priority');
    for (const field of ['subtasks', 'attachments', 'deps', 'labels']) if (task[field] != null && !Array.isArray(task[field])) invalid.push(`tasks.${field}`);
    for (const field of ['subtasks', 'attachments']) if (task[field] != null && !validEntityArray(task[field])) invalid.push(`tasks.${field}`);
    if (
      Array.isArray(task.subtasks) &&
      task.subtasks.some(
        item =>
          !isObject(item) ||
          (item.title != null && typeof item.title !== 'string') ||
          (item.desc != null && typeof item.desc !== 'string') ||
          (item.done != null && typeof item.done !== 'boolean'),
      )
    )
      invalid.push('tasks.subtasks');
    for (const field of ['deps', 'labels'])
      if (Array.isArray(task[field]) && task[field].some(item => typeof item !== 'string')) invalid.push(`tasks.${field}`);
    if (!validDate(task.due) || !validDate(task.start)) invalid.push('tasks.date');
    if (Array.isArray(task.deps) && task.deps.some(id => id === task.id || !taskIds.has(id))) invalid.push('tasks.deps');
    if (task.title != null && (typeof task.title !== 'string' || task.title.length > 20_000)) invalid.push('tasks.title');
    if (task.desc != null && typeof task.desc !== 'string') invalid.push('tasks.desc');
  }
  for (const project of Array.isArray(value.projects) ? value.projects : []) {
    if (!isObject(project)) continue;
    if (project.iconImage != null && project.iconImage !== '' && !projectImageData(project.iconImage)) invalid.push('projects.iconImage');
    try {
      validateProjectFileFolders(project);
    } catch {
      invalid.push('projects.fileFolders');
    }
    if (project.seq != null && (!Number.isSafeInteger(project.seq) || project.seq < 0)) invalid.push('projects.seq');
    if (
      project.perms != null &&
      (!isObject(project.perms) ||
        Object.values(project.perms).some(permission => !['Can view', 'Can comment', 'Can edit', 'Full access'].includes(permission)))
    )
      invalid.push('projects.perms');
    if (project.members != null && !Array.isArray(project.members)) invalid.push('projects.members');
    if (project.members?.some?.(id => typeof id !== 'string')) invalid.push('projects.members');
    if (project.key != null && (typeof project.key !== 'string' || !/^[\p{L}\p{N}_-]{1,32}$/u.test(project.key))) invalid.push('projects.key');
    if (project.milestones != null && (!Array.isArray(project.milestones) || project.milestones.some(item => !isObject(item) || !validDate(item.date))))
      invalid.push('projects.milestones');
    if (
      project.milestones != null &&
      (!validEntityArray(project.milestones) || project.milestones.some(item => item.name != null && typeof item.name !== 'string'))
    )
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
  const organizedFiles = [
    ...(Array.isArray(value.files) ? value.files : []),
    ...(Array.isArray(value.tasks) ? value.tasks : [])
      .filter(isObject)
      .flatMap(task =>
        (Array.isArray(task.attachments) ? task.attachments : []).filter(isObject).map(file => ({ ...file, project: file.project || task.project })),
      ),
  ];
  for (const file of organizedFiles) {
    try {
      assertFileFolder(
        value.projects?.find(project => project.id === file.project),
        file.folderId,
      );
    } catch {
      invalid.push('files.folderId');
    }
  }
  if (invalid.length) throw new WorkspaceValidationError([...new Set(invalid)]);
  validateDocumentInput('knowledge', value);
  validateDocumentInput('bookmarks', value);
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
  const [contentField, folderField] = fields;
  const folders = new Map(value[folderField].map(folder => [folder.id, folder]));
  const parentField = name === 'knowledge' ? 'parentId' : 'parent_id';
  const contentFolder = name === 'knowledge' ? 'folderId' : 'folder';
  const resolved = new Map();
  for (const folder of folders.values()) {
    const path = new Set();
    let current = folder;
    while (current && !resolved.has(current.id)) {
      if (path.has(current.id) || path.size >= 200) throw new WorkspaceValidationError([`${folderField}.cycle`]);
      path.add(current.id);
      const parent = current[parentField];
      if (parent != null && parent !== '' && !folders.has(parent)) throw new WorkspaceValidationError([`${folderField}.parent`]);
      current = parent ? folders.get(parent) : null;
    }
    let depth = current ? resolved.get(current.id) : 0;
    if (depth + path.size > 200) throw new WorkspaceValidationError([`${folderField}.depth`]);
    for (const id of [...path].reverse()) resolved.set(id, ++depth);
  }
  for (const item of value[contentField]) {
    if (
      item.wikiRefs != null &&
      (!Array.isArray(item.wikiRefs) ||
        item.wikiRefs.some(
          ref => !isObject(ref) || typeof ref.label !== 'string' || typeof ref.target !== 'string' || (ref.target && !validIdentity(ref.target)),
        ))
    )
      invalid.push(`${contentField}.wikiRefs`);
    if (item[contentFolder] != null && item[contentFolder] !== '' && !folders.has(item[contentFolder])) invalid.push(`${contentField}.folder`);
    for (const field of ['title', 'summary', 'formatted_markdown', 'description', 'url'])
      if (item[field] != null && typeof item[field] !== 'string') invalid.push(`${contentField}.${field}`);
    if (item.tags != null && (!Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string'))) invalid.push(`${contentField}.tags`);
  }
  if (invalid.length) throw new WorkspaceValidationError([...new Set(invalid)]);
  return value;
}
