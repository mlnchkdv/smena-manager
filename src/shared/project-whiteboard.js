import { validWhiteboardMedia } from './whiteboard-media.js';
export const BOARD_COLORS = ['neutral', 'violet', 'blue', 'green', 'amber', 'rose'];
export const LEGACY_BOARD_SHAPES = ['rectangle', 'ellipse', 'diamond'];
export const BOARD_SHAPES = [
  ...LEGACY_BOARD_SHAPES,
  'triangle',
  'pentagon',
  'hexagon',
  'parallelogram',
  'trapezoid',
  'cylinder',
  'document',
  'arrow-right',
  'star',
];
export const BOARD_LINE_STYLES = ['solid', 'dashed', 'dotted'];
export const BOARD_ENDINGS = ['none', 'arrow', 'dot'];
export const WHITEBOARD_PDF_PAGE_VERSION = 6;
export const WHITEBOARD_IMAGE_VERSION = 7;
export const WHITEBOARD_GROUP_VERSION = 8;
export const WHITEBOARD_LOCK_VERSION = 9;
export const WHITEBOARD_VISIBILITY_VERSION = 10;
export const WHITEBOARD_CARD_LIMIT = 200;
export const whiteboardEdgeEnd = (edge, side) => edge[side + 'End'] ?? (side === 'to' && edge.arrow ? 'arrow' : 'none');
export const emptyWhiteboard = () => ({ version: 1, nodes: [], edges: [] });
export const whiteboardOf = project => project?.whiteboard || emptyWhiteboard();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && /^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
export function validWhiteboard(board) {
  if (
    !object(board) ||
    !Number.isInteger(board.version) ||
    board.version < 1 ||
    board.version > WHITEBOARD_VISIBILITY_VERSION ||
    !Array.isArray(board.nodes) ||
    !Array.isArray(board.edges)
  )
    return false;
  const keys = ['version', 'nodes', 'edges', ...(board.version >= WHITEBOARD_GROUP_VERSION ? ['groups'] : [])];
  if (Object.keys(board).some(k => !keys.includes(k)) || board.nodes.length > WHITEBOARD_CARD_LIMIT || board.edges.length > 400) return false;
  if (JSON.stringify(board).length > 350000) return false;
  const layerFields = [...(board.version >= WHITEBOARD_LOCK_VERSION ? ['locked'] : []), ...(board.version >= WHITEBOARD_VISIBILITY_VERSION ? ['hidden'] : [])];
  const validLayerFlags = item => layerFields.every(key => !Object.hasOwn(item, key) || item[key] === true);
  const ids = new Set();
  for (const node of board.nodes) {
    if (!object(node) || !identity(node.id) || ids.has(node.id) || !['text', 'material', 'group', ...(board.version >= 3 ? ['shape'] : [])].includes(node.type))
      return false;
    ids.add(node.id);
    if (
      Object.keys(node).some(
        k =>
          ![
            'id',
            'type',
            'x',
            'y',
            'width',
            'height',
            'color',
            'title',
            'text',
            'target',
            ...(board.version >= 2 ? ['media'] : []),
            ...(board.version >= 3 ? ['shape'] : []),
            ...(board.version >= 4 ? ['sequence'] : []),
            ...layerFields,
          ].includes(k),
      )
    )
      return false;
    if (!validLayerFlags(node)) return false;
    if (node.type === 'shape' ? !(board.version >= 5 ? BOARD_SHAPES : LEGACY_BOARD_SHAPES).includes(node.shape) : Object.hasOwn(node, 'shape')) return false;
    if (Object.hasOwn(node, 'sequence') && (node.type !== 'group' || !Number.isSafeInteger(node.sequence) || node.sequence < 0 || node.sequence > 1000000))
      return false;
    if (
      Object.hasOwn(node, 'media') &&
      (node.type !== 'material' ||
        typeof node.target !== 'string' ||
        !node.target.startsWith('file:') ||
        !validWhiteboardMedia(node.media) ||
        (node.media.fixed && board.version < WHITEBOARD_PDF_PAGE_VERSION) ||
        (node.media.image && board.version < WHITEBOARD_IMAGE_VERSION))
    )
      return false;
    if (!['x', 'y', 'width', 'height'].every(k => Number.isSafeInteger(node[k]) && Math.abs(node[k]) <= 50000)) return false;
    if (node.width < 160 || node.width > 2000 || node.height < 100 || node.height > 2000 || !BOARD_COLORS.includes(node.color)) return false;
    if (node.type === 'material') {
      if (node.title != null || node.text != null || !/^(note|task|project|bookmark|file|whiteboard):[\p{L}\p{N}_.:@+-]{1,180}$/u.test(node.target))
        return false;
    } else if (!text(node.title, 120) || !text(node.text, 6000) || node.target != null) return false;
  }
  const edges = new Set();
  for (const edge of board.edges) {
    if (!object(edge) || !identity(edge.id) || edges.has(edge.id) || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return false;
    if (Object.keys(edge).some(k => !['id', 'from', 'to', 'label', 'arrow', 'color', ...(board.version >= 3 ? ['fromEnd', 'toEnd', 'style'] : [])].includes(k)))
      return false;
    if (!text(edge.label, 120) || typeof edge.arrow !== 'boolean' || !BOARD_COLORS.includes(edge.color)) return false;
    if (Object.hasOwn(edge, 'style') && !BOARD_LINE_STYLES.includes(edge.style)) return false;
    if (['from', 'to'].some(side => Object.hasOwn(edge, side + 'End') && !BOARD_ENDINGS.includes(edge[side + 'End']))) return false;
    if (Object.hasOwn(edge, 'toEnd') && edge.arrow !== (edge.toEnd === 'arrow')) return false;
    edges.add(edge.id);
  }
  if (Object.hasOwn(board, 'groups')) {
    const cards = new Set(board.nodes.filter(node => node.type !== 'group' && !node.locked && !node.hidden).map(node => node.id));
    if (!Array.isArray(board.groups) || board.groups.length > Math.floor(cards.size / 2)) return false;
    for (const group of board.groups) {
      if (!object(group) || !identity(group.id) || ids.has(group.id) || Object.keys(group).some(k => !['id', 'members', ...layerFields].includes(k)))
        return false;
      if (!validLayerFlags(group)) return false;
      if (!Array.isArray(group.members) || group.members.length < 2 || group.members.length > cards.size) return false;
      for (const id of group.members) if (!cards.delete(id)) return false;
      ids.add(group.id);
    }
  }
  return true;
}
export function whiteboardLockedIds(board) {
  const ids = new Set(board.nodes.filter(node => node.locked).map(node => node.id));
  for (const group of board.groups || []) if (group.locked) for (const id of group.members) ids.add(id);
  return ids;
}
export function whiteboardVisibleBoard(board) {
  const hidden = new Set(board.nodes.filter(node => node.hidden).map(node => node.id));
  for (const group of board.groups || []) if (group.hidden) for (const id of group.members) hidden.add(id);
  if (!hidden.size) return board;
  return {
    ...board,
    nodes: board.nodes.filter(node => !hidden.has(node.id)),
    edges: board.edges.filter(edge => !hidden.has(edge.from) && !hidden.has(edge.to)),
    ...(board.groups ? { groups: board.groups.filter(group => !group.hidden) } : {}),
  };
}
export function whiteboardPaintOrder(nodes) {
  return [...nodes].sort((a, b) => Number(a.type !== 'group') - Number(b.type !== 'group'));
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
  if (board.groups) {
    board.groups = board.groups.filter(group => {
      if (!group.members.includes(id)) return true;
      group.members = group.members.filter(member => member !== id);
      if (group.members.length > 1) return true;
      const survivor = board.nodes.find(node => node.id === group.members[0]);
      if (group.locked && survivor) survivor.locked = true;
      if (group.hidden && survivor) survivor.hidden = true;
      return false;
    });
    if (!board.groups.length) delete board.groups;
  }
}
