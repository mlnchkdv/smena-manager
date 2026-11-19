import { whiteboardBounds, validWhiteboard, whiteboardLockedIds, whiteboardVisibleBoard } from './project-whiteboard.js';
import { expandWhiteboardSelection, whiteboardSelectionNodes } from './whiteboard-selection.js';
export function groupResizeNodes(board, ids, contents = false) {
  const shown = whiteboardVisibleBoard(board);
  if (contents) return whiteboardSelectionNodes(shown, ids);
  const selected = expandWhiteboardSelection(shown, ids);
  return shown.nodes.filter(node => selected.includes(node.id));
}
export function resizeWhiteboardGroup(board, ids, direction, dx, dy, { contents = false, lockAspect = true } = {}) {
  const nodes = groupResizeNodes(board, ids, contents);
  const locked = whiteboardLockedIds(board);
  if (!nodes.length || nodes.some(node => locked.has(node.id)) || !/^(n|ne|e|se|s|sw|w|nw)$/u.test(direction) || ![dx, dy].every(Number.isFinite)) return board;
  const bounds = whiteboardBounds({ nodes });
  let sx = direction.includes('e') ? 1 + dx / bounds.width : direction.includes('w') ? 1 - dx / bounds.width : 1;
  let sy = direction.includes('s') ? 1 + dy / bounds.height : direction.includes('n') ? 1 - dy / bounds.height : 1;
  if (lockAspect) sx = sy = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
  const clamp = (scale, axis) => Math.max(...nodes.map(n => (axis === 'width' ? 160 : 100) / n[axis]), Math.min(...nodes.map(n => 2000 / n[axis]), scale));
  if (lockAspect)
    sx = sy = Math.max(...nodes.flatMap(n => [160 / n.width, 100 / n.height]), Math.min(...nodes.flatMap(n => [2000 / n.width, 2000 / n.height]), sx));
  else {
    sx = clamp(sx, 'width');
    sy = clamp(sy, 'height');
  }
  const ax = bounds.x + (direction.includes('w') ? bounds.width : 0),
    ay = bounds.y + (direction.includes('n') ? bounds.height : 0);
  const chosen = new Set(nodes.map(n => n.id));
  const next = {
    ...board,
    nodes: board.nodes.map(n =>
      chosen.has(n.id)
        ? { ...n, x: Math.round(ax + (n.x - ax) * sx), y: Math.round(ay + (n.y - ay) * sy), width: Math.round(n.width * sx), height: Math.round(n.height * sy) }
        : n,
    ),
  };
  return validWhiteboard(next) ? next : board;
}
