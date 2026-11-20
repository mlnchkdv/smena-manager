const key = (workspace, actor, project) => 'smena:research:pending:v1:' + [workspace, actor, project].map(encodeURIComponent).join(':');
function storedCommand(name) {
  try {
    const command = JSON.parse(localStorage.getItem(name));
    return command?.operationId && command.action ? command : null;
  } catch {
    return null;
  }
}

export function pendingResearchCommands(...scope) {
  const base = key(...scope);
  try {
    const names = Object.keys(localStorage).filter(name => name === base || name.startsWith(base + '/'));
    const commands = new Map();
    for (const name of names) {
      const command = storedCommand(name);
      if (command) commands.set(command.operationId, command);
    }
    return [...commands.values()];
  } catch {
    return [];
  }
}

export function readPendingResearch(...scope) {
  return pendingResearchCommands(...scope)[0] || null;
}

export function keepPendingResearch(workspace, actor, project, command) {
  const text = JSON.stringify(command);
  if (text.length > 512000) throw new Error('RESEARCH_DRAFT_LIMIT');
  localStorage.setItem(key(workspace, actor, project) + '/' + encodeURIComponent(command.operationId), text);
}

export function clearPendingResearch(workspace, actor, project, operationId) {
  const base = key(workspace, actor, project);
  localStorage.removeItem(base + '/' + encodeURIComponent(operationId));
  if (storedCommand(base)?.operationId === operationId) localStorage.removeItem(base);
}

const draftKey = scope => key(...scope).replace(':pending:', ':drafts:');

function readDraftValue(name) {
  try {
    return JSON.parse(localStorage.getItem(name));
  } catch {
    return null;
  }
}

export function listResearchDrafts(scope) {
  try {
    const base = draftKey(scope);
    const legacy = readDraftValue(base);
    const drafts = new Map((Array.isArray(legacy) ? legacy : []).filter(item => item?.id).map(item => [item.id, item]));
    for (const name of Object.keys(localStorage).filter(name => name.startsWith(base + '/'))) {
      const draft = readDraftValue(name);
      if (draft?.id) drafts.set(draft.id, draft);
    }
    return [...drafts.values()].filter(draft => draft?.id && draft.record?.kind && draft.record.data);
  } catch {
    return [];
  }
}

export function keepResearchDraft(scope, draft) {
  if (JSON.stringify(draft).length > 512000) throw new Error('RESEARCH_DRAFT_LIMIT');
  localStorage.setItem(draftKey(scope) + '/' + encodeURIComponent(draft.id), JSON.stringify(draft));
}

export function clearResearchDraft(scope, id) {
  const base = draftKey(scope);
  localStorage.removeItem(base + '/' + encodeURIComponent(id));
  const legacy = readDraftValue(base);
  if (!Array.isArray(legacy) || !legacy.some(item => item.id === id)) return;
  const remaining = legacy.filter(item => item.id !== id);
  if (remaining.length) localStorage.setItem(draftKey(scope), JSON.stringify(remaining));
  else localStorage.removeItem(draftKey(scope));
}
