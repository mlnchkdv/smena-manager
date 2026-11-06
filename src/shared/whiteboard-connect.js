// A direct gesture adds a relation to the latest board, never a captured copy.
// Repeated gestures reuse an existing directed pair instead of duplicating it.
export function whiteboardConnection(board, from, to, id) {
  if (!board?.nodes?.some(node => node.id === from) || !board.nodes.some(node => node.id === to) || from === to) return null;
  const existing = board.edges.find(edge => edge.from === from && edge.to === to);
  if (existing) return { edge: existing, created: false };
  if (board.edges.length >= 400) return null;
  return { edge: { id, from, to, label: '', arrow: true, color: 'neutral' }, created: true };
}
