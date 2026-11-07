import { validWhiteboard, emptyWhiteboard, whiteboardEdgeEnd } from './project-whiteboard.js';
const colors = { neutral: undefined, violet: '6', blue: '5', green: '4', amber: '3', rose: '1' };
const fail = () => {
  throw new TypeError('WHITEBOARD_IMPORT_INVALID');
};
export function jsonCanvasExportLosses(board) {
  if (!validWhiteboard(board)) fail();
  return [
    ...(board.nodes.some(node => node.media) ? ['mediaOffsets'] : []),
    ...(board.nodes.some(node => node.type === 'shape') ? ['shapes'] : []),
    ...(board.edges.some(edge => edge.style && edge.style !== 'solid') ? ['lineStyles'] : []),
    ...(board.edges.some(edge => ['from', 'to'].some(side => whiteboardEdgeEnd(edge, side) === 'dot')) ? ['dotEndings'] : []),
  ];
}
export function exportJsonCanvas(board, { allowLossy = false } = {}) {
  if (!validWhiteboard(board)) fail();
  if (!allowLossy && jsonCanvasExportLosses(board).length) throw new TypeError('WHITEBOARD_EXPORT_LOSS_REVIEW_REQUIRED');
  return {
    nodes: board.nodes.map(n => ({
      id: n.id,
      type: n.type === 'material' ? 'link' : n.type === 'shape' ? 'text' : n.type,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      ...(colors[n.color] ? { color: colors[n.color] } : {}),
      ...(n.type === 'material'
        ? { url: `smena://material/${n.target.slice(0, n.target.indexOf(':'))}/${encodeURIComponent(n.target.slice(n.target.indexOf(':') + 1))}` }
        : n.type === 'group'
          ? { label: n.title }
          : { text: (n.title ? '# ' + n.title + '\n\n' : '') + n.text }),
    })),
    edges: board.edges.map(e => ({
      id: e.id,
      fromNode: e.from,
      toNode: e.to,
      fromEnd: whiteboardEdgeEnd(e, 'from') === 'arrow' ? 'arrow' : 'none',
      toEnd: whiteboardEdgeEnd(e, 'to') === 'arrow' ? 'arrow' : 'none',
      label: e.label,
      ...(colors[e.color] ? { color: colors[e.color] } : {}),
    })),
  };
}
export function parseWhiteboardImport(source) {
  if (typeof source !== 'string' || source.length > 1048576) fail();
  let v;
  try {
    v = JSON.parse(source);
  } catch {
    fail();
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
  if (v.format === 'smena-project-whiteboard') {
    if (v.version !== 1 || !validWhiteboard(v.board)) fail();
    return { board: structuredClone(v.board), warnings: [], format: 'Smena JSON' };
  }
  const nodes = v.nodes ?? [],
    edges = v.edges ?? [];
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 200 || edges.length > 400 || (!Object.hasOwn(v, 'nodes') && !Object.hasOwn(v, 'edges')))
    fail();
  const warnings = new Set(),
    ids = new Map(),
    board = emptyWhiteboard();
  const color = value => {
    if (value == null) return 'neutral';
    const c = Object.keys(colors).find(k => colors[k] === value);
    if (!c) warnings.add('colors');
    return c || 'neutral';
  };
  const string = (s, max) => {
    if (typeof s !== 'string' || s.length > max) fail();
    return s;
  };
  for (const [i, n] of nodes.entries()) {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !['text', 'group', 'file', 'link'].includes(n.type)) fail();
    ids.set(n.id, 'import-node-' + i);
    const node = { id: ids.get(n.id), type: n.type, x: n.x, y: n.y, width: n.width, height: n.height, color: color(n.color) };
    if (n.type === 'text') {
      const text = string(n.text, 6124),
        heading = text.match(/^# ([^\n]{1,120})\n\n/);
      Object.assign(node, { title: heading?.[1] || '', text: heading ? text.slice(heading[0].length) : text });
    } else if (n.type === 'group') {
      Object.assign(node, { title: string(n.label ?? '', 120), text: '' });
      if (n.background || n.backgroundStyle) warnings.add('backgrounds');
    } else if (n.type === 'file') {
      const path = string(n.file, 5000),
        subpath = string(n.subpath ?? '', 500);
      Object.assign(node, { type: 'text', title: '', text: path + subpath });
      warnings.add('files');
    } else {
      const url = string(n.url, 6000),
        own = url.match(/^smena:\/\/material\/(note|task|project|bookmark|file|whiteboard)\/(.+)$/);
      if (own) {
        let id;
        try {
          id = decodeURIComponent(own[2]);
        } catch {
          fail();
        }
        Object.assign(node, { type: 'material', target: own[1] + ':' + id });
      } else {
        Object.assign(node, { type: 'text', title: '', text: url });
        warnings.add('links');
      }
    }
    board.nodes.push(node);
  }
  const edgeIds = new Set();
  for (const [i, e] of edges.entries()) {
    if (
      !e ||
      typeof e.id !== 'string' ||
      !e.id ||
      edgeIds.has(e.id) ||
      !ids.has(e.fromNode) ||
      !ids.has(e.toNode) ||
      !['none', 'arrow'].includes(e.fromEnd ?? 'none') ||
      !['none', 'arrow'].includes(e.toEnd ?? 'arrow')
    )
      fail();
    edgeIds.add(e.id);
    const from = ids.get(e.fromNode),
      to = ids.get(e.toNode);
    const start = e.fromEnd === 'arrow',
      end = (e.toEnd ?? 'arrow') === 'arrow';
    if (e.fromSide || e.toSide) warnings.add('sides');
    if (start) board.version = 3;
    board.edges.push({
      id: 'import-edge-' + i,
      from,
      to,
      arrow: end,
      ...(start ? { fromEnd: 'arrow', toEnd: end ? 'arrow' : 'none' } : {}),
      color: color(e.color),
      label: string(e.label ?? '', 120),
    });
  }
  if (!validWhiteboard(board)) fail();
  return { board, format: 'JSON Canvas 1.0', warnings: [...warnings] };
}
