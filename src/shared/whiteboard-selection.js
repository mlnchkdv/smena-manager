import {
  movedWhiteboardNodes,
  validWhiteboard,
  whiteboardBounds,
  whiteboardLockedIds,
  whiteboardPaintOrder,
  whiteboardVisibleBoard,
  WHITEBOARD_GROUP_VERSION,
  WHITEBOARD_LOCK_VERSION,
  WHITEBOARD_VISIBILITY_VERSION,
} from './project-whiteboard.js';
import { appendFrameSequence } from './whiteboard-presentation.js';

export function whiteboardGroupsInSelection(board, selection) {
  return (board.groups || []).filter(group => group.members.some(id => selection.includes(id)));
}

export function expandWhiteboardSelection(board, selection) {
  const nodes = new Set(board.nodes.map(node => node.id));
  return [...new Set([...selection.filter(id => nodes.has(id)), ...whiteboardGroupsInSelection(board, selection).flatMap(group => group.members)])];
}

function whiteboardGroupsByMember(board) {
  return new Map((board.groups || []).flatMap(group => group.members.map(id => [id, group])));
}

export function whiteboardLayerUnits(board) {
  const groups = whiteboardGroupsByMember(board);
  const layers = new Map();
  for (const node of whiteboardPaintOrder(board.nodes).reverse()) {
    const group = groups.get(node.id);
    const id = group?.id || node.id;
    const record = group || node;
    if (!layers.has(id))
      layers.set(id, { id, kind: group ? 'group' : node.type === 'group' ? 'frame' : 'card', locked: !!record.locked, hidden: !!record.hidden, nodes: [] });
    layers.get(id).nodes.push(node);
  }
  return [...layers.values()];
}

export function setWhiteboardLayerHidden(board, id, hidden) {
  const group = board.groups?.find(item => item.id === id);
  // A group member shares the visibility of its row in the layers panel.
  if (!group && board.groups?.some(item => item.members.includes(id))) return;
  const layer = group || board.nodes.find(node => node.id === id);
  if (!layer) return;
  if (hidden) {
    board.version = Math.max(board.version, WHITEBOARD_VISIBILITY_VERSION);
    layer.hidden = true;
  } else delete layer.hidden;
}

function reorderLayerTiers(nodes, reorder) {
  const frames = reorder(
    nodes.filter(node => node.type === 'group'),
    'frame',
  );
  const cards = reorder(
    nodes.filter(node => node.type !== 'group'),
    'card',
  );
  let frameIndex = 0,
    cardIndex = 0;
  const result = nodes.map(node => (node.type === 'group' ? frames[frameIndex++] : cards[cardIndex++]));
  return result.some((node, index) => node !== nodes[index]) ? result : nodes;
}

export function moveWhiteboardLayer(board, source, target, position) {
  if (source === target || !['before', 'after'].includes(position)) return board.nodes;
  const units = whiteboardLayerUnits(board);
  const moving = units.find(layer => layer.id === source);
  if (!moving || moving.locked) return board.nodes;
  const tier = moving.kind === 'frame' ? 'frame' : 'card';
  const neighbors = units.filter(layer => (layer.kind === 'frame') === (tier === 'frame'));
  const oldIndex = neighbors.indexOf(moving);
  const remaining = neighbors.filter(layer => layer !== moving);
  const targetIndex = remaining.findIndex(layer => layer.id === target);
  if (targetIndex < 0) return board.nodes;
  const destination = targetIndex + Number(position === 'after');
  if (destination === oldIndex) return board.nodes;

  // Anchor the drop above the next visible layer. Unrelated cards retain their original stacking order.
  const below = remaining[destination]?.nodes[0].id;
  const picked = new Set(moving.nodes.map(node => node.id));
  return reorderLayerTiers(board.nodes, (nodes, kind) => {
    if (kind !== tier) return nodes;
    const rest = nodes.filter(node => !picked.has(node.id)).reverse();
    const index = below ? rest.findIndex(node => node.id === below) : rest.length;
    rest.splice(index, 0, ...moving.nodes);
    return rest.reverse();
  });
}

function stepWhiteboardLayer(nodes, selected, layerOf) {
  const rest = [],
    chosen = [];
  for (const node of nodes) {
    if (selected.has(node.id)) chosen.push({ node, gap: rest.length });
    else rest.push(node);
  }
  if (!chosen.length || !rest.length) return nodes;

  const firstRest = new Map();
  rest.forEach((node, index) => {
    const layer = layerOf(node);
    if (!firstRest.has(layer)) firstRest.set(layer, index);
  });
  const lastChosen = new Map(chosen.map(({ node }, index) => [layerOf(node), index]));
  const slots = rest.map(() => []);
  let target = 0;
  for (let start = 0; start < chosen.length;) {
    // Keep runs of selected cards and all members of the same group together.
    let end = start;
    for (let index = start; index <= end; index++) {
      end = Math.max(end, lastChosen.get(layerOf(chosen[index].node)));
      if (chosen[index + 1]?.gap === chosen[index].gap) end = Math.max(end, index + 1);
    }
    const neighbor = rest[chosen[start].gap - 1];
    // Skip all members of the neighboring group without overtaking another selected block.
    if (neighbor) target = Math.max(target, firstRest.get(layerOf(neighbor)));
    slots[target].push(...chosen.slice(start, end + 1).map(({ node }) => node));
    start = end + 1;
  }
  return rest.flatMap((node, index) => [...slots[index], node]);
}

export function reorderWhiteboardLayers(board, selection, direction) {
  if (!['front', 'back', 'forward', 'backward'].includes(direction)) return board.nodes;
  const selected = new Set(expandWhiteboardSelection(board, selection));
  const locked = whiteboardLockedIds(board);
  if (!selected.size || [...selected].some(id => locked.has(id))) return board.nodes;

  const groups = whiteboardGroupsByMember(board);
  const layerOf = node => groups.get(node.id)?.id ?? node.id;
  const reorder = nodes => {
    if (direction === 'backward') return stepWhiteboardLayer(nodes, selected, layerOf);
    if (direction === 'forward') return stepWhiteboardLayer(nodes.reverse(), selected, layerOf).reverse();
    const chosen = nodes.filter(node => selected.has(node.id));
    const rest = nodes.filter(node => !selected.has(node.id));
    return direction === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
  };
  return reorderLayerTiers(board.nodes, reorder);
}

export function whiteboardSelectionUnits(board, selection) {
  const groups = whiteboardGroupsInSelection(board, selection);
  const members = new Set(groups.flatMap(group => group.members));
  return [
    ...groups.map(group => board.nodes.filter(node => group.members.includes(node.id))),
    ...board.nodes.filter(node => selection.includes(node.id) && !members.has(node.id)).map(node => [node]),
  ];
}

export function canGroupWhiteboardSelection(board, selection, units = whiteboardSelectionUnits(board, selection)) {
  const locked = whiteboardLockedIds(board);
  const visible = new Set(whiteboardVisibleBoard(board).nodes.map(node => node.id));
  return units.length >= 2 && units.every(nodes => nodes[0].type !== 'group' && nodes.every(node => visible.has(node.id) && !locked.has(node.id)));
}

export function groupWhiteboardSelection(board, selection, id) {
  if (!canGroupWhiteboardSelection(board, selection)) return;
  const members = expandWhiteboardSelection(board, selection);
  ungroupWhiteboardSelection(board, members);
  board.version = Math.max(board.version, WHITEBOARD_GROUP_VERSION);
  board.groups = [...(board.groups || []), { id, members }];
}

export function ungroupWhiteboardSelection(board, selection) {
  if (!board.groups) return;
  board.groups = board.groups.filter(group => group.locked || group.hidden || !group.members.some(id => selection.includes(id)));
  if (!board.groups.length) delete board.groups;
}

export function setWhiteboardPositionLock(board, selection, locked) {
  const groups = whiteboardGroupsInSelection(board, selection);
  const members = new Set(groups.flatMap(group => group.members));
  const targets = [...groups, ...board.nodes.filter(node => selection.includes(node.id) && !members.has(node.id))];
  if (!targets.length) return;
  if (locked) board.version = Math.max(board.version, WHITEBOARD_LOCK_VERSION);
  for (const target of targets) {
    if (locked) target.locked = true;
    else delete target.locked;
  }
}

export function whiteboardSelectionInRect(nodes, rect) {
  const { left, top, right, bottom } = rect;
  if (left >= right || top >= bottom) return [];
  return nodes
    .filter(node => {
      const nodeRight = node.x + node.width;
      const nodeBottom = node.y + node.height;
      return node.type === 'group'
        ? node.x >= left && node.y >= top && nodeRight <= right && nodeBottom <= bottom
        : node.x < right && node.y < bottom && nodeRight > left && nodeBottom > top;
    })
    .map(node => node.id);
}

export function whiteboardSelectionOffset(nodes, dx, dy) {
  if (!nodes.length) return { dx: 0, dy: 0 };
  const clamp = (axis, delta) => Math.max(...nodes.map(node => -50000 - node[axis]), Math.min(...nodes.map(node => 50000 - node[axis]), delta));
  return { dx: clamp('x', dx), dy: clamp('y', dy) };
}

export function whiteboardSelectionNodes(board, selection) {
  const moving = selection.flatMap(id => movedWhiteboardNodes(board, id).map(n => n.id));
  const ids = new Set(expandWhiteboardSelection(board, moving));
  return board.nodes.filter(n => ids.has(n.id));
}
export function movableWhiteboardNodes(board, selection) {
  const nodes = whiteboardSelectionNodes(whiteboardVisibleBoard(board), selection);
  const locked = whiteboardLockedIds(board);
  return nodes.some(node => locked.has(node.id)) ? [] : nodes;
}
export function copyWhiteboardSelection(board, selection) {
  const nodes = structuredClone(whiteboardSelectionNodes(board, selection)),
    ids = new Set(nodes.map(n => n.id));
  const groups = structuredClone((board.groups || []).filter(group => group.members.every(id => ids.has(id))));
  return {
    version: board.version,
    nodes,
    edges: structuredClone(board.edges.filter(e => ids.has(e.from) && ids.has(e.to))),
    ...(groups.length ? { groups } : {}),
  };
}
export function pasteWhiteboardSelection(board, fragment, idFactory, dx = 40, dy = 40) {
  if (!validWhiteboard(fragment)) return null;
  const ids = new Map(fragment.nodes.map(n => [n.id, idFactory('wc')]));
  const nodes = fragment.nodes.map(n => ({ ...structuredClone(n), id: ids.get(n.id), x: n.x + dx, y: n.y + dy }));
  const edges = fragment.edges.map(e => ({ ...structuredClone(e), id: idFactory('we'), from: ids.get(e.from), to: ids.get(e.to) }));
  const groups = [
    ...structuredClone(board.groups || []),
    ...(fragment.groups || []).map(group => ({ ...group, id: idFactory('wg'), members: group.members.map(id => ids.get(id)) })),
  ];
  const next = {
    version: Math.max(board.version, fragment.version),
    nodes: [...structuredClone(board.nodes), ...nodes],
    edges: [...board.edges, ...edges],
    ...(groups.length ? { groups } : {}),
  };
  appendFrameSequence({ nodes: next.nodes.slice(0, board.nodes.length) }, nodes);
  return validWhiteboard(next) ? { board: next, ids: nodes.map(n => n.id) } : null;
}
export function arrangeWhiteboardSelection(board, selection, mode) {
  const shown = whiteboardVisibleBoard(board);
  const chosen = whiteboardSelectionUnits(shown, selection).map(nodes => ({ ...whiteboardBounds({ nodes }), nodes }));
  const horizontal = mode === 'distribute-x',
    vertical = mode === 'distribute-y';
  if (chosen.length < (horizontal || vertical ? 3 : 2) || !movableWhiteboardNodes(board, selection).length) return board;
  const next = structuredClone(board),
    target = new Map();
  const left = Math.min(...chosen.map(n => n.x)),
    top = Math.min(...chosen.map(n => n.y)),
    right = Math.max(...chosen.map(n => n.x + n.width)),
    bottom = Math.max(...chosen.map(n => n.y + n.height));
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
    if (horizontal || vertical) {
      if (horizontal) x = Math.round(cursor);
      else y = Math.round(cursor);
      cursor += (horizontal ? n.width : n.height) + space / (chosen.length - 1);
    }
    for (const member of n.nodes) target.set(member.id, { x: member.x + x - n.x, y: member.y + y - n.y });
  }
  const inherited = new Map();
  for (const n of board.nodes)
    if (n.type === 'group' && target.has(n.id)) {
      const p = target.get(n.id);
      for (const child of whiteboardSelectionNodes(shown, [n.id]))
        if (!target.has(child.id) && !inherited.has(child.id)) inherited.set(child.id, { x: child.x + p.x - n.x, y: child.y + p.y - n.y });
    }
  for (const n of next.nodes) {
    const p = target.get(n.id) || inherited.get(n.id);
    if (p) Object.assign(n, p);
  }
  return validWhiteboard(next) ? next : board;
}
