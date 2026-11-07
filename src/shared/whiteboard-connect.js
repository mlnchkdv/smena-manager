// A direct gesture adds a relation to the latest board, never a captured copy.
// Repeated gestures reuse an existing directed pair instead of duplicating it.
export function whiteboardConnection(board, from, to, id) {
  if (!board?.nodes?.some(node => node.id === from) || !board.nodes.some(node => node.id === to) || from === to) return null;
  const existing = board.edges.find(edge => edge.from === from && edge.to === to);
  if (existing) return { edge: existing, created: false };
  if (board.edges.length >= 400) return null;
  return { edge: { id, from, to, label: '', arrow: true, color: 'neutral' }, created: true };
}

// Change one endpoint against its captured value. Independent labels/styles
// survive; a competing endpoint change cannot be silently overwritten.
export function reconnectWhiteboardEdge(board, { id, side, base, target }) {
  if (!['from', 'to'].includes(side)) return { error: 'invalid' };
  const edge = board.edges.find(edge => edge.id === id);
  if (!edge || !board.nodes.some(node => node.id === target)) return { error: 'missing' };
  if (edge[side] !== base && edge[side] !== target) return { error: 'changed' };
  if (edge[side === 'from' ? 'to' : 'from'] === target) return { error: 'self' };
  const from = side === 'from' ? target : edge.from,
    to = side === 'to' ? target : edge.to;
  if (board.edges.some(other => other.id !== id && other.from === from && other.to === to)) return { error: 'duplicate' };
  if (edge[side] === target) return { changed: false };
  edge[side] = target;
  return { changed: true };
}
