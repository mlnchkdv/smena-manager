import { canEditProject, canReadProject, entityProjectId, projectAccess, trashProject, trashProjectId } from '../shared/project-access.js';
import { memberForProfile } from '../shared/member-identity.js';
import { notificationRecipient } from '../shared/notification-model.js';
import { restoreUnauthorizedChanges } from '../shared/workspace-permissions.js';
import { entityAllowed } from '../shared/relations.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const FILE_FIELDS = ['storageFileId', 'storageName', 'bytes', 'size', 'mimeType', 'ownerId', 'by', 'at', 'type'];
const SCOPED = ['tasks', 'comments', 'files', 'events', 'savedViews', 'activity'];

export function permissionError(field = 'project') {
  return Object.assign(new Error('You do not have permission to change this item.'), { statusCode: 403, code: 'ENTITY_FORBIDDEN', fields: [field] });
}

export function projectWorkspace(database, user) {
  const data = structuredClone(database);
  const memberId = memberForProfile(data, user)?.id || user.id;
  const readable = new Set((data.projects || []).filter(project => canReadProject(project, memberId, user.role)).map(project => project.id));
  data.projects = (data.projects || []).filter(project => readable.has(project.id));
  const tasks = new Set((data.tasks || []).filter(task => readable.has(task.project)).map(task => task.id));
  data.tasks = (data.tasks || []).filter(task => tasks.has(task.id));
  data.comments = (data.comments || []).filter(comment => tasks.has(comment.task));
  for (const field of ['files', 'events', 'savedViews']) data[field] = (data[field] || []).filter(item => readable.has(entityProjectId(item, database)));
  data.activity = (data.activity || []).filter(item => {
    const projectId = entityProjectId(item, database);
    return projectId ? readable.has(projectId) : user.role === 'admin' || item.by === memberId;
  });
  data.notifs = (data.notifs || []).filter(item => {
    const projectId = entityProjectId(item, database);
    return notificationRecipient(item, database) === memberId && (!projectId || readable.has(projectId));
  });
  data.notifPrefs = data.notifPrefs?.[memberId] ? { [memberId]: data.notifPrefs[memberId] } : {};
  data.projOrder = (data.projOrder || []).filter(id => readable.has(id));
  data.trash = (data.trash || []).filter(item => {
    const project = trashProject(item) || database.projects?.find(project => project.id === trashProjectId(item));
    return project ? canReadProject(project, memberId, user.role) : user.role === 'admin' || item.deletedBy === memberId;
  });
  data.sessions = [];
  data.relations = (data.relations || []).filter(
    edge => entityAllowed(data, edge.from, { role: user.role, memberId }) && entityAllowed(data, edge.to, { role: user.role, memberId }),
  );
  data.invoices = [];
  for (const key of Object.keys(data)) if (key.startsWith('_')) delete data[key];
  return data;
}

function protectedFiles(database) {
  return [...(database.files || []), ...(database.trash || []).flatMap(item => [item.data?.file, ...(item.data?.files || [])]).filter(Boolean)];
}

export function validateClientFiles(current, candidate, role, memberId) {
  const trusted = protectedFiles(current);
  const known = new Map(trusted.map(file => [file.id, file]));
  const verify = file => {
    // Legacy decorative entries are harmless, but cannot become storage-backed through a snapshot.
    if (!file?.storageName && !file?.storageFileId) return;
    const original = known.get(file.id) || trusted.find(item => item.storageFileId === file.storageFileId && item.storageName === file.storageName);
    if (!original || FILE_FIELDS.some(field => !same(file[field], original[field]))) throw permissionError('files');
    if (role !== 'admin' && (original.id !== file.id || original.project !== file.project || original.task !== file.task)) {
      const source =
        current.projects?.find(project => project.id === original.project) ||
        current.trash?.find(item => item.data?.project?.id === original.project)?.data.project;
      if (!source || !canReadProject(source, memberId, role)) throw permissionError('files');
    }
  };
  for (const file of protectedFiles(candidate)) verify(file);
  for (const task of candidate.tasks || []) for (const file of task.attachments || []) verify(file);
  if (role !== 'admin') {
    const remaining = new Set((candidate.files || []).map(file => file.id));
    for (const file of current.files || []) {
      if (!remaining.has(file.id) && file.by && file.by !== memberId) throw permissionError('files');
    }
  }
}

export function mergeClientWorkspace(current, incoming, role, memberId) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new TypeError('Workspace data must be an object.');
  const candidate = { ...current, ...structuredClone(incoming) };
  for (const key of Object.keys(candidate)) {
    if (!key.startsWith('_')) continue;
    if (Object.hasOwn(current, key)) candidate[key] = structuredClone(current[key]);
    else delete candidate[key];
  }
  const visible = projectWorkspace(current, { id: memberId, role });
  const projects = new Map((current.projects || []).map(project => [project.id, project]));
  const proposed = new Map((candidate.projects || []).map(project => [project.id, project]));
  const readable = project => canReadProject(project, memberId, role);
  const editable = id => canEditProject(projects.get(id) || proposed.get(id), memberId, role);
  const commentable = id => projectAccess(projects.get(id) || proposed.get(id), memberId, role) >= 2;

  if (role !== 'admin') {
    const guarded = restoreUnauthorizedChanges(current, candidate, role, memberId);
    for (const field of guarded.fields) candidate[field] = guarded.data[field];
    for (const project of candidate.projects || []) {
      const before = projects.get(project.id);
      if (!before && current.ws?.permissions?.createProjects === false) throw permissionError('projects');
      if (before && !same(before, project)) {
        if (!canEditProject(before, memberId, role)) throw permissionError('projects');
        if (
          projectAccess(before, memberId, role) < 4 &&
          ['private', 'access', 'members', 'perms', 'lead'].some(field => !same(before[field], project[field]))
        ) {
          throw permissionError('projects');
        }
      }
    }
    for (const project of current.projects || []) {
      if (readable(project) && !proposed.has(project.id) && !canEditProject(project, memberId, role)) throw permissionError('projects');
    }
  }

  // Filtered clients cannot delete entities they never received.
  candidate.projects = [
    ...(current.projects || []).filter(project => !readable(project)),
    ...(candidate.projects || []).filter(project => !projects.has(project.id) || readable(projects.get(project.id))),
  ];
  for (const field of SCOPED) {
    if (!Object.hasOwn(incoming, field)) continue;
    if (!Array.isArray(incoming[field])) throw new TypeError(`Invalid collection: ${field}.`);
    const before = new Map((current[field] || []).map(item => [item.id, item]));
    const exposed = new Set((visible[field] || []).map(item => item.id));
    const requested = new Set(incoming[field].map(item => item.id));
    for (const item of incoming[field]) {
      const previous = before.get(item.id);
      if (previous && same(previous, item)) continue;
      if (field === 'comments' && previous && ['task', 'by', 'at'].some(key => !same(previous[key], item[key]))) throw permissionError('comments');
      if (field === 'comments' && previous && role !== 'admin') {
        for (const key of ['re', 'reactions'])
          for (const emoji of new Set([...Object.keys(previous[key] || {}), ...Object.keys(item[key] || {})])) {
            const other = values => (values || []).filter(id => id !== memberId).sort();
            if (!same(other(previous[key]?.[emoji]), other(item[key]?.[emoji]))) throw permissionError('comments.reactions');
          }
      }
      const target = entityProjectId(item, { ...current, tasks: candidate.tasks });
      const originalTarget = previous && entityProjectId(previous, current);
      const allowed = field === 'comments' ? commentable : editable;
      if (role !== 'admin' && ((!target && field !== 'activity') || (target && !allowed(target)) || (originalTarget && !allowed(originalTarget)))) {
        throw permissionError(field);
      }
      if (role !== 'admin' && field === 'comments' && previous?.by !== memberId && previous && !same(previous.text, item.text)) throw permissionError(field);
    }
    for (const item of current[field] || []) {
      if (!requested.has(item.id) && exposed.has(item.id)) {
        const projectId = entityProjectId(item, current);
        if (role !== 'admin' && projectId && !(field === 'comments' ? commentable(projectId) : editable(projectId))) throw permissionError(field);
        if (role !== 'admin' && field === 'comments' && item.by !== memberId) throw permissionError(field);
      }
    }
    candidate[field] = [
      ...(current[field] || []).filter(item => !exposed.has(item.id)),
      ...incoming[field].filter(item => !before.has(item.id) || exposed.has(item.id)),
    ];
  }
  if (Object.hasOwn(incoming, 'projOrder')) {
    candidate.projOrder = [...new Set([...(incoming.projOrder || []), ...(current.projOrder || []).filter(id => !visible.projOrder?.includes(id))])];
  }
  // Notification read states are reconciled by the server; preferences are always personal.
  candidate.notifPrefs = { ...current.notifPrefs, ...(incoming.notifPrefs?.[memberId] ? { [memberId]: incoming.notifPrefs[memberId] } : {}) };
  if (Object.hasOwn(incoming, 'trash')) {
    const exposed = new Set((visible.trash || []).map(item => item.id));
    for (const item of incoming.trash || []) {
      const previous = current.trash?.find(entry => entry.id === item.id);
      if (previous && !same(previous, item)) throw permissionError('trash');
      const project = trashProject(item) || projects.get(trashProjectId(item));
      if (!previous && project && !canEditProject(project, memberId, role)) throw permissionError('trash');
    }
    candidate.trash = [
      ...(current.trash || []).filter(item => !exposed.has(item.id)),
      ...(incoming.trash || []).filter(item => !current.trash?.some(entry => entry.id === item.id) || exposed.has(item.id)),
    ];
  }
  validateClientFiles(current, candidate, role, memberId);
  if (Object.hasOwn(incoming, 'relations')) {
    if (!Array.isArray(incoming.relations)) throw permissionError('relations');
    const exposed = new Set((visible.relations || []).map(edge => edge.id));
    const before = new Map((current.relations || []).map(edge => [edge.id, edge]));
    for (const edge of incoming.relations) {
      const previous = before.get(edge.id);
      if (previous && same(previous, edge)) continue;
      if (previous && !exposed.has(edge.id)) throw permissionError('relations');
      const targets = [edge.from, edge.to, ...(previous ? [previous.from, previous.to] : [])];
      if (targets.some(key => !entityAllowed(candidate, key, { role, memberId }, true))) throw permissionError('relations');
      if (previous?.deletedAt && !edge.deletedAt) throw permissionError('relations');
    }
    const incomingIds = new Set(incoming.relations.map(edge => edge.id));
    if ((visible.relations || []).some(edge => !incomingIds.has(edge.id))) throw permissionError('relations');
    candidate.relations = [...(current.relations || []).filter(edge => !exposed.has(edge.id)), ...incoming.relations];
  }
  return candidate;
}
