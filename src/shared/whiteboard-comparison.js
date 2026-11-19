import { whiteboardPaintOrder } from './project-whiteboard.js';

export function compareWhiteboards(current, previous) {
  const rows = [];
  for (const [field, kind] of [
    ['nodes', 'card'],
    ['edges', 'connection'],
    ['groups', 'group'],
  ]) {
    const a = new Map((current?.[field] || []).map(n => [n.id, n]));
    const b = new Map((previous?.[field] || []).map(n => [n.id, n]));
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const before = a.get(id),
        after = b.get(id);
      if (JSON.stringify(before) !== JSON.stringify(after)) rows.push({ id, kind, change: !before ? 'added' : !after ? 'removed' : 'changed', before, after });
    }
  }
  const currentOrder = whiteboardPaintOrder(current?.nodes || []).map(node => node.id);
  const previousOrder = whiteboardPaintOrder(previous?.nodes || []).map(node => node.id);
  const common = new Set(currentOrder.filter(id => previousOrder.includes(id)));
  const before = currentOrder.filter(id => common.has(id));
  const after = previousOrder.filter(id => common.has(id));
  const layerIds = before.filter((id, index) => id !== after[index]);
  return {
    rows,
    layerIds,
    added: rows.filter(r => r.change === 'added').length,
    removed: rows.filter(r => r.change === 'removed').length,
    changed: rows.filter(r => r.change === 'changed').length + Number(layerIds.length > 0),
  };
}
