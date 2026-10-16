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
  if (invalid.length) throw new WorkspaceValidationError([...new Set(invalid)]);
  return value;
}
