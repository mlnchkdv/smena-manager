import { createHash, randomUUID } from 'node:crypto';
import { whiteboardOf, validWhiteboard } from '../shared/project-whiteboard.js';
export const whiteboardHash = board => createHash('sha256').update(JSON.stringify(board)).digest('hex');
export function whiteboardVersions(database, projectId) {
  return (Array.isArray(database._whiteboardHistory) ? database._whiteboardHistory : [])
    .filter(v => (v.whiteboard || v.project) === projectId && typeof v.id === 'string' && validWhiteboard(v.board))
    .slice(0, 5);
}
export function captureWhiteboardHistory(current, next, actor = '') {
  const versions = (Array.isArray(current._whiteboardHistory) ? current._whiteboardHistory : []).filter(v => validWhiteboard(v?.board));
  const old = new Map((current.whiteboards || current.projects || []).map(p => [p.id, p]));
  for (const project of next.whiteboards || next.projects || []) {
    const before = old.get(project.id);
    delete project.whiteboardRestoreFrom;
    delete project.whiteboardReplaceBaseHash;
    if (!before || whiteboardHash(whiteboardOf(before)) === whiteboardHash(whiteboardOf(project))) continue;
    versions.unshift({
      id: 'wbv-' + randomUUID(),
      project: project.id,
      whiteboard: project.id,
      at: new Date().toISOString(),
      by: actor,
      sourceBy: before.editedBy || before.by || '',
      sourceAt: before.editedAt || before.at || '',
      editedBy: actor,
      board: structuredClone(whiteboardOf(before)),
    });
  }
  for (const p of next.projects || []) {
    delete p.whiteboardRestoreFrom;
    delete p.whiteboardReplaceBaseHash;
  }
  const counts = new Map(),
    retained = [];
  let chars = 0;
  for (const version of versions) {
    const id = version.whiteboard || version.project,
      count = counts.get(id) || 0,
      size = JSON.stringify(version).length;
    if (count >= 5 || chars + size > 700000) continue;
    counts.set(id, count + 1);
    chars += size;
    retained.push(version);
  }
  next._whiteboardHistory = retained;
}
export function validateWhiteboardRestore(current, project) {
  if (project.whiteboardReplaceBaseHash != null) {
    const hash = project.whiteboardReplaceBaseHash;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('Invalid whiteboard replacement request.');
    const before = current.whiteboards?.find(p => p.id === project.id) || current.projects?.find(p => p.id === project.id);
    if (!before || whiteboardHash(whiteboardOf(before)) !== hash)
      throw Object.assign(new Error('The whiteboard changed. Reopen the import before replacing.'), { statusCode: 409, code: 'WHITEBOARD_REPLACE_STALE' });
  }
  const token = project.whiteboardRestoreFrom;
  if (token == null) return;
  if (
    !token ||
    typeof token !== 'object' ||
    Array.isArray(token) ||
    Object.keys(token).some(k => !['id', 'baseHash'].includes(k)) ||
    typeof token.id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(token.baseHash || '')
  )
    throw new TypeError('Invalid whiteboard restore request.');
  const before = current.whiteboards?.find(p => p.id === project.id) || current.projects?.find(p => p.id === project.id),
    version = whiteboardVersions(current, project.id).find(v => v.id === token.id);
  if (!before || !version || whiteboardHash(whiteboardOf(before)) !== token.baseHash)
    throw Object.assign(new Error('The whiteboard changed. Reopen its history before restoring.'), { statusCode: 409, code: 'WHITEBOARD_RESTORE_STALE' });
  if (whiteboardHash(whiteboardOf(project)) !== whiteboardHash(version.board))
    throw new TypeError('The requested whiteboard version does not match its saved content.');
}
