import { whiteboardHash } from './whiteboard-history.js';
// Bounded geometry and board-owned titles only. Material bodies, targets and cached labels never enter this DTO.
export function whiteboardCatalogProjection(data) {
  const entries = (data.whiteboards || []).map(b => ({
    id: b.id,
    hash: whiteboardHash(b.whiteboard),
    cards: b.whiteboard.nodes.length,
    connections: b.whiteboard.edges.length,
    thumbnail: {
      nodes: b.whiteboard.nodes.slice(0, 40).map(({ id, type, x, y, width, height, color, title }) => ({
        id,
        type,
        x,
        y,
        width,
        height,
        color,
        ...(type !== 'material' && title ? { title: String(title).slice(0, 64) } : {}),
      })),
      edges: b.whiteboard.edges.slice(0, 60).map(({ from, to }) => ({ from, to })),
    },
  }));
  const omit = (item, field) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== field));
  return {
    data: { ...data, whiteboards: (data.whiteboards || []).map(b => omit(b, 'whiteboard')), projects: data.projects.map(p => omit(p, 'whiteboard')) },
    whiteboardCatalog: { version: 1, entries },
  };
}
export function restoreWhiteboardBodies(current, incoming) {
  const next = structuredClone(incoming);
  if (Array.isArray(next.whiteboards))
    for (const b of next.whiteboards) {
      if (!Object.hasOwn(b, 'whiteboard')) {
        const old = current.whiteboards?.find(v => v.id === b.id);
        if (!old) throw new TypeError('A new whiteboard requires its content.');
        b.whiteboard = structuredClone(old.whiteboard);
      }
    }
  if (Array.isArray(next.projects))
    for (const p of next.projects) {
      const old = current.projects?.find(v => v.id === p.id);
      if (!Object.hasOwn(p, 'whiteboard') && old?.whiteboard) p.whiteboard = structuredClone(old.whiteboard);
    }
  return next;
}
