import { movedWhiteboardNodes, validWhiteboard } from './project-whiteboard.js';
import { appendFrameSequence } from './whiteboard-presentation.js';
export function whiteboardSelectionNodes(board, selection) {
  const ids = new Set(selection.flatMap(id => movedWhiteboardNodes(board, id).map(n => n.id)));
  return board.nodes.filter(n => ids.has(n.id));
}
export function copyWhiteboardSelection(board, selection) {
  const nodes = structuredClone(whiteboardSelectionNodes(board, selection)),
    ids = new Set(nodes.map(n => n.id));
  return { version: board.version, nodes, edges: structuredClone(board.edges.filter(e => ids.has(e.from) && ids.has(e.to))) };
}
export function pasteWhiteboardSelection(board, fragment, idFactory, dx = 40, dy = 40) {
  if (!validWhiteboard(fragment)) return null;
  const ids = new Map(fragment.nodes.map(n => [n.id, idFactory('wc')]));
  const nodes = fragment.nodes.map(n => ({ ...structuredClone(n), id: ids.get(n.id), x: n.x + dx, y: n.y + dy }));
  const edges = fragment.edges.map(e => ({ ...structuredClone(e), id: idFactory('we'), from: ids.get(e.from), to: ids.get(e.to) }));
  const next = { version: Math.max(board.version, fragment.version), nodes: [...structuredClone(board.nodes), ...nodes], edges: [...board.edges, ...edges] };
  appendFrameSequence({ nodes: next.nodes.slice(0, board.nodes.length) }, nodes);
  return validWhiteboard(next) ? { board: next, ids: nodes.map(n => n.id) } : null;
}
export function arrangeWhiteboardSelection(board, selection, mode) {
  const chosen = board.nodes.filter(n => selection.includes(n.id));
  if (chosen.length < 2) return board;
  const next = structuredClone(board),
    target = new Map();
  const left = Math.min(...chosen.map(n => n.x)),
    top = Math.min(...chosen.map(n => n.y)),
    right = Math.max(...chosen.map(n => n.x + n.width)),
    bottom = Math.max(...chosen.map(n => n.y + n.height));
  const horizontal = mode === 'distribute-x',
    vertical = mode === 'distribute-y';
  const sorted = [...chosen].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const space = horizontal ? right - left - chosen.reduce((s, n) => s + n.width, 0) : bottom - top - chosen.reduce((s, n) => s + n.height, 0);
  let cursor = horizontal ? left : top;
  for (const n of horizontal || vertical ? sorted : chosen) {
    let x = n.x,
      y = n.y;
    if (mode === 'left') x = left;
    if (mode === 'right') x = right - n.width;
    if (mode === 'top') y = top;
    if (mode === 'bottom') y = bottom - n.height;
    if (mode === 'center-x') x = Math.round((left + right - n.width) / 2);
    if (mode === 'center-y') y = Math.round((top + bottom - n.height) / 2);
    if ((horizontal || vertical) && chosen.length >= 3) {
      if (horizontal) x = Math.round(cursor);
      else y = Math.round(cursor);
      cursor += (horizontal ? n.width : n.height) + space / (chosen.length - 1);
    }
    target.set(n.id, { x, y });
  }
  const inherited = new Map();
  for (const n of chosen)
    if (n.type === 'group') {
      const p = target.get(n.id);
      for (const child of movedWhiteboardNodes(board, n.id))
        if (!target.has(child.id) && !inherited.has(child.id)) inherited.set(child.id, { x: child.x + p.x - n.x, y: child.y + p.y - n.y });
    }
  for (const n of next.nodes) {
    const p = target.get(n.id) || inherited.get(n.id);
    if (p) Object.assign(n, p);
  }
  return validWhiteboard(next) ? next : board;
}
