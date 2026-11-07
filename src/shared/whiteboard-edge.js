import { whiteboardEdgeEnd } from './project-whiteboard.js';
export function whiteboardEdgeGeometry(from, to, headSize = 12) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = b.x - a.x,
    dy = b.y - a.y,
    distance = Math.hypot(dx, dy);
  if (!distance) return null;
  const ux = dx / distance,
    uy = dy / distance;
  const boundary = node => Math.min(Math.abs(dx) ? node.width / 2 / Math.abs(dx) : Infinity, Math.abs(dy) ? node.height / 2 / Math.abs(dy) : Infinity, 0.45);
  const start = boundary(from),
    end = boundary(to);
  const x1 = a.x + dx * start + ux * 2,
    y1 = a.y + dy * start + uy * 2;
  const x2 = b.x - dx * end - ux * 3,
    y2 = b.y - dy * end - uy * 3;
  const head = `${x2},${y2} ${x2 - ux * headSize - (uy * headSize) / 2},${y2 - uy * headSize + (ux * headSize) / 2} ${x2 - ux * headSize + (uy * headSize) / 2},${y2 - uy * headSize - (ux * headSize) / 2}`;
  return { x1, y1, x2, y2, head, labelX: (x1 + x2) / 2, labelY: (y1 + y2) / 2 };
}

export function whiteboardEdgeText(
  board,
  edge,
  {
    nameOf,
    noLabel = 'No label',
    directed = 'Directed',
    undirected = 'No arrow',
    colors = {},
    start = 'Start',
    end = 'End',
    style = 'Line',
    endings = {},
    styles = {},
  } = {},
) {
  if (!edge) return '—';
  const name = id => {
    const node = board.nodes.find(node => node.id === id);
    return (node && nameOf?.(node)) || node?.title || node?.target || id;
  };
  const a = whiteboardEdgeEnd(edge, 'from'),
    b = whiteboardEdgeEnd(edge, 'to');
  const symbol = a === 'arrow' ? (b === 'arrow' ? '↔' : '←') : b === 'arrow' ? '→' : '—';
  const details =
    edge.style || edge.fromEnd || edge.toEnd
      ? ` · ${style}: ${styles[edge.style || 'solid'] || edge.style || 'solid'} · ${start}: ${endings[a] || a} · ${end}: ${endings[b] || b}`
      : '';
  return `${name(edge.from)} ${symbol} ${name(edge.to)} · ${edge.label || noLabel} · ${a === 'arrow' || b === 'arrow' ? directed : undirected} · ${colors[edge.color] || edge.color}${details}`;
}

export function whiteboardDiffVisibleIds(current, previous, rows) {
  const cards = new Set(rows.filter(row => row.kind === 'card').map(row => row.id));
  const edges = new Set(rows.filter(row => row.kind === 'connection').map(row => row.id));
  const result = new Set(cards);
  for (const edge of [...current.edges, ...previous.edges])
    if (cards.has(edge.from) || cards.has(edge.to) || edges.has(edge.id)) {
      result.add(edge.from);
      result.add(edge.to);
    }
  return result;
}
