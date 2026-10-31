import { canReadWhiteboard, canEditWhiteboard, whiteboardDocuments, legacyWhiteboard, migrateProjectWhiteboards } from '../shared/whiteboards.js';
import { entityAllowed } from '../shared/relations.js';
import { validateWhiteboardRestore } from './whiteboard-history.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const denied = field => {
  throw Object.assign(new Error('You do not have permission to change this whiteboard.'), { statusCode: 403, code: 'ENTITY_FORBIDDEN', fields: [field] });
};

export function mergeWhiteboards(current, candidate, incoming, role, memberId) {
  const old = new Map(whiteboardDocuments(current).map(b => [b.id, b]));
  const exposed = new Set(
    whiteboardDocuments(current)
      .filter(b => canReadWhiteboard(current, b, memberId, role))
      .map(b => b.id),
  );
  if (Object.hasOwn(incoming, 'whiteboards')) {
    if (!Array.isArray(incoming.whiteboards)) throw new TypeError('Invalid whiteboard collection.');
    for (const b of incoming.whiteboards) {
      const previous = old.get(b?.id);
      if (previous && !exposed.has(b.id) && !same(previous, b)) denied('whiteboards');
      if (previous && (previous.project !== b.project || previous.legacyProject !== b.legacyProject)) denied('whiteboards.project');
      if (!previous && b.legacyProject != null) denied('whiteboards.legacyProject');
    }
    if ([...exposed].some(id => !incoming.whiteboards.some(b => b?.id === id))) denied('whiteboards.archive');
    candidate.whiteboards = [
      ...whiteboardDocuments(current).filter(b => !exposed.has(b.id)),
      ...incoming.whiteboards.filter(b => !old.has(b?.id) || exposed.has(b.id)),
    ];
  } else candidate.whiteboards = structuredClone(whiteboardDocuments(current));

  // Older clients still edit the former project field. Bridge those edits to
  // the same document instead of creating a second independent source of truth.
  for (const p of incoming.projects || []) {
    const before = current.projects?.find(v => v.id === p.id);
    if (p.whiteboard == null || same(p.whiteboard, before?.whiteboard)) continue;
    const existing = legacyWhiteboard(candidate, p.id),
      previous = legacyWhiteboard(current, p.id);
    if (existing && previous && !same(existing.whiteboard, previous.whiteboard) && !same(existing.whiteboard, p.whiteboard))
      throw Object.assign(new Error('Concurrent legacy whiteboard edit.'), { statusCode: 409, code: 'WHITEBOARD_LEGACY_CONFLICT' });
    if (existing) {
      existing.whiteboard = structuredClone(p.whiteboard);
      for (const key of ['whiteboardRestoreFrom', 'whiteboardReplaceBaseHash']) if (p[key] != null) existing[key] = p[key];
    }
  }
  // This also handles the first non-empty edit from an older project client.
  migrateProjectWhiteboards(candidate);
  for (const b of whiteboardDocuments(candidate)) {
    const before = old.get(b.id);
    if (before && same(before, b)) continue;
    const sourceAllowed = before
      ? canEditWhiteboard(current, before, memberId, role)
      : !b.project || !current.projects?.some(p => p.id === b.project) || canEditWhiteboard(current, b, memberId, role);
    if (!sourceAllowed || !canEditWhiteboard(candidate, b, memberId, role)) denied('whiteboards');
    if (before && (before.by !== b.by || before.at !== b.at)) denied('whiteboards.author');
    const nodes = new Map((before?.whiteboard?.nodes || []).map(n => [n.id, n]));
    for (const n of b.whiteboard?.nodes || [])
      if (n.type === 'material' && n.target !== nodes.get(n.id)?.target && !entityAllowed(current, n.target, { role, memberId })) denied('whiteboards.target');
    validateWhiteboardRestore(current, b);
    if (!before) {
      b.by = memberId;
      b.at = new Date().toISOString();
    }
    b.editedBy = memberId;
    b.editedAt = new Date().toISOString();
  }
  for (const b of whiteboardDocuments(candidate))
    if (b.legacyProject) {
      const p = candidate.projects?.find(p => p.id === b.legacyProject);
      if (p) p.whiteboard = structuredClone(b.whiteboard);
    }
}
