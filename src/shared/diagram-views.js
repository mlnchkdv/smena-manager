export const defaultDiagramViews = () => ({ version: 1, items: [], active: [], pins: [] });
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => typeof v === 'string' && v.length <= max;
const number = (v, limit = 10000000) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
const only = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
const point = v => only(v, ['id', 'x', 'y', 'locked']) && text(v.id, 200) && v.id.length > 0 && number(v.x) && number(v.y) && typeof v.locked === 'boolean';
export function validDiagramViews(v) {
  if (
    !only(v, ['version', 'items', 'active', 'pins']) ||
    v.version !== 1 ||
    !Array.isArray(v.items) ||
    v.items.length > 12 ||
    !Array.isArray(v.active) ||
    !Array.isArray(v.pins) ||
    v.pins.length > 250 ||
    !v.pins.every(point) ||
    new Set(v.pins.map(p => p.id)).size !== v.pins.length ||
    JSON.stringify(v).length > 180000
  )
    return false;
  if (v.items.some(i => !object(i)) || new Set(v.items.map(i => i.id)).size !== v.items.length || v.items.filter(i => i.kind === 'graph').length > 3)
    return false;
  for (const i of v.items) {
    if (
      !only(i, ['id', 'name', 'kind', 'project', 'layout', 'context']) ||
      !text(i.id, 100) ||
      !i.id ||
      !text(i.name, 80) ||
      !i.name.trim() ||
      !text(i.project, 180) ||
      !['board', 'graph'].includes(i.kind)
    )
      return false;
    if (i.kind === 'board') {
      if (
        !i.project ||
        !only(i.layout, ['x', 'y', 'zoom', 'outline']) ||
        !number(i.layout.x) ||
        !number(i.layout.y) ||
        !number(i.layout.zoom, 2.5) ||
        i.layout.zoom < 0.2 ||
        typeof i.layout.outline !== 'boolean' ||
        i.context != null
      )
        return false;
    } else {
      const l = i.layout,
        c = i.context;
      if (
        i.project !== '' ||
        !only(l, ['positions', 'zoom', 'pan', 'width', 'height']) ||
        !Array.isArray(l.positions) ||
        l.positions.length > 250 ||
        !l.positions.every(point) ||
        new Set(l.positions.map(p => p.id)).size !== l.positions.length ||
        !number(l.zoom, 4) ||
        l.zoom < 0.02 ||
        !only(l.pan, ['x', 'y']) ||
        !number(l.pan.x) ||
        !number(l.pan.y) ||
        !number(l.width, 20000) ||
        l.width <= 0 ||
        !number(l.height, 20000) ||
        l.height <= 0 ||
        !only(c, ['center', 'query', 'kind', 'project', 'connected', 'archive', 'depth']) ||
        !text(c.center, 200) ||
        !text(c.query, 1000) ||
        !['', 'note', 'task', 'project', 'bookmark', 'file', 'whiteboard'].includes(c.kind) ||
        !text(c.project, 180) ||
        !['', 'yes'].includes(c.connected) ||
        !['', 'yes'].includes(c.archive) ||
        ![1, 2].includes(c.depth)
      )
        return false;
    }
  }
  if (v.active.length > 12 || new Set(v.active).size !== v.active.length || v.active.some(id => !v.items.some(i => i.id === id))) return false;
  return (
    new Set(
      v.active.map(id => {
        const i = v.items.find(i => i.id === id);
        return i.kind + ':' + i.project;
      }),
    ).size === v.active.length
  );
}
export function diagramPreferences(raw) {
  try {
    const v = JSON.parse(raw);
    return validDiagramViews(v) ? v : defaultDiagramViews();
  } catch {
    return defaultDiagramViews();
  }
}
