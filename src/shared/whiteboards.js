import { canEditProject, canReadProject } from './project-access.js';
import { validWhiteboard, whiteboardOf } from './project-whiteboard.js';

export const whiteboardDocuments = data => (Array.isArray(data.whiteboards) ? data.whiteboards : []);
export const legacyWhiteboard = (data, project) => whiteboardDocuments(data).find(b => b.legacyProject === project);
export const whiteboardDocument = (data, id) => whiteboardDocuments(data).find(b => b.id === id);
export function canReadWhiteboard(data, board, memberId, role) {
  return (
    !!board &&
    (!board.project ||
      canReadProject(
        data.projects?.find(p => p.id === board.project),
        memberId,
        role,
      ))
  );
}
export function canEditWhiteboard(data, board, memberId, role) {
  return (
    ['admin', 'editor'].includes(role) &&
    canReadWhiteboard(data, board, memberId, role) &&
    !data.projects?.find(p => p.id === board.project)?.archived &&
    (!board.project ||
      canEditProject(
        data.projects?.find(p => p.id === board.project),
        memberId,
        role,
      ))
  );
}
// Retain legacy project fields as compatibility aliases. Only the migration
// creates documents; aliases never resurrect an archived document or replace it.
export function migrateProjectWhiteboards(data) {
  if (data.whiteboards == null) data.whiteboards = [];
  if (!Array.isArray(data.whiteboards)) return data;
  for (const p of data.projects || []) {
    const board = p?.whiteboard;
    if (
      !validWhiteboard(board) ||
      legacyWhiteboard(data, p.id) ||
      (!board.nodes.length && !board.edges.length && !data._whiteboardHistory?.some(v => v.project === p.id))
    )
      continue;
    let id = p.id,
      i = 0;
    while (data.whiteboards.some(b => b.id === id)) id = 'legacy-' + p.id.slice(0, 150) + '-' + ++i;
    data.whiteboards.push({
      id,
      name: String(p.name || 'Whiteboard').slice(0, 160),
      desc: '',
      project: p.id,
      legacyProject: p.id,
      by: typeof p.lead === 'string' ? p.lead : typeof data.me === 'string' ? data.me : '',
      at: typeof data.createdAt === 'string' && Number.isFinite(Date.parse(data.createdAt)) ? data.createdAt : '1970-01-01T00:00:00.000Z',
      archived: false,
      whiteboard: structuredClone(board),
    });
    for (const v of data._whiteboardHistory || []) if (!v.whiteboard && v.project === p.id) v.whiteboard = id;
  }
  return data;
}
export function validWhiteboardDocument(b) {
  return (
    !!b &&
    typeof b === 'object' &&
    !Array.isArray(b) &&
    typeof b.name === 'string' &&
    b.name.trim().length > 0 &&
    b.name.length <= 160 &&
    typeof b.desc === 'string' &&
    b.desc.length <= 2000 &&
    typeof b.project === 'string' &&
    (!b.project || /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(b.project)) &&
    typeof b.by === 'string' &&
    typeof b.at === 'string' &&
    Number.isFinite(Date.parse(b.at)) &&
    typeof b.archived === 'boolean' &&
    validWhiteboard(whiteboardOf(b)) &&
    !!b.whiteboard &&
    (b.legacyProject == null || b.legacyProject === b.project)
  );
}
