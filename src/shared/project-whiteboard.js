export const BOARD_COLORS = ['neutral', 'violet', 'blue', 'green', 'amber', 'rose'];
export const emptyWhiteboard = () => ({ version: 1, nodes: [], edges: [] });
export const whiteboardOf = project => project?.whiteboard || emptyWhiteboard();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
export function validWhiteboard(board) {
  if (!object(board) || board.version !== 1 || !Array.isArray(board.nodes) || !Array.isArray(board.edges)) return false;
  if (Object.keys(board).some(k => !['version', 'nodes', 'edges'].includes(k)) || board.nodes.length > 200 || board.edges.length > 400) return false;
  if (JSON.stringify(board).length > 350000) return false;
  const ids = new Set();
  for (const node of board.nodes) {
    if (!object(node) || !identity(node.id) || ids.has(node.id) || !['text', 'material', 'group'].includes(node.type)) return false;
    ids.add(node.id);
    if (Object.keys(node).some(k => !['id', 'type', 'x', 'y', 'width', 'height', 'color', 'title', 'text', 'target'].includes(k))) return false;
    if (!['x', 'y', 'width', 'height'].every(k => Number.isSafeInteger(node[k]) && Math.abs(node[k]) <= 50000)) return false;
    if (node.width < 160 || node.width > 2000 || node.height < 100 || node.height > 2000 || !BOARD_COLORS.includes(node.color)) return false;
    if (node.type === 'material') {
      if (node.title != null || node.text != null || !/^(note|task|project|bookmark|file):[\p{L}\p{N}_.:@+-]{1,180}$/u.test(node.target)) return false;
    } else if (!text(node.title, 120) || !text(node.text, 6000) || node.target != null) return false;
  }
  const edges = new Set();
  for (const edge of board.edges) {
    if (!object(edge) || !identity(edge.id) || edges.has(edge.id) || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return false;
    if (Object.keys(edge).some(k => !['id', 'from', 'to', 'label', 'arrow', 'color'].includes(k))) return false;
    if (!text(edge.label, 120) || typeof edge.arrow !== 'boolean' || !BOARD_COLORS.includes(edge.color)) return false;
    edges.add(edge.id);
  }
  return true;
}
export function whiteboardBounds(board) {
  if (!board.nodes.length) return { x: 0, y: 0, width: 600, height: 400 };
  const x = Math.min(...board.nodes.map(n => n.x)),
    y = Math.min(...board.nodes.map(n => n.y));
  return { x, y, width: Math.max(...board.nodes.map(n => n.x + n.width)) - x, height: Math.max(...board.nodes.map(n => n.y + n.height)) - y };
}
export function movedWhiteboardNodes(board, id) {
  const node = board.nodes.find(n => n.id === id);
  if (!node) return [];
  return board.nodes.filter(
    n =>
      n.id === id ||
      (node.type === 'group' &&
        n.type !== 'group' &&
        n.x >= node.x &&
        n.y >= node.y &&
        n.x + n.width <= node.x + node.width &&
        n.y + n.height <= node.y + node.height),
  );
}
export function removeWhiteboardNode(board, id) {
  board.nodes = board.nodes.filter(n => n.id !== id);
  board.edges = board.edges.filter(e => e.from !== id && e.to !== id);
}
