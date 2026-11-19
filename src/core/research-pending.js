const key = (workspace, actor, project) => 'smena:research:pending:v1:' + [workspace, actor, project].map(encodeURIComponent).join(':');
export function readPendingResearch(workspace, actor, project) {
  try {
    const text = localStorage.getItem(key(workspace, actor, project));
    if (!text) return null;
    const command = JSON.parse(text);
    return command?.operationId && command?.action ? command : null;
  } catch {
    return null;
  }
}
export function keepPendingResearch(workspace, actor, project, command) {
  const text = JSON.stringify(command);
  if (text.length > 512000) throw new Error('RESEARCH_DRAFT_LIMIT');
  localStorage.setItem(key(workspace, actor, project), text);
}
export function clearPendingResearch(workspace, actor, project, operationId) {
  if (readPendingResearch(workspace, actor, project)?.operationId === operationId) localStorage.removeItem(key(workspace, actor, project));
}
