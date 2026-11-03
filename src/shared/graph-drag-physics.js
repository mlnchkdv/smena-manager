// Spring-follow only the loaded connected component. No workspace positions are written.
export function createGraphDragPhysics(nodes, edges, anchorId, { reducedMotion = false } = {}) {
  const all = new Map(nodes.filter(n => Number.isFinite(n.x) && Number.isFinite(n.y)).map(n => [n.id, n]));
  if (!all.has(anchorId) || all.get(anchorId).locked) return null;
  const adjacent = new Map([...all.keys()].map(id => [id, []]));
  for (const edge of edges) {
    if (!all.has(edge.from) || !all.has(edge.to)) continue;
    adjacent.get(edge.from).push(edge.to);
    adjacent.get(edge.to).push(edge.from);
  }
  const component = new Set([anchorId]),
    queue = [anchorId];
  for (let i = 0; i < queue.length; i++)
    for (const id of adjacent.get(queue[i]))
      if (!component.has(id)) {
        component.add(id);
        queue.push(id);
      }
  const state = new Map(
    [...component].map(id => {
      const n = all.get(id);
      return [id, { ...n, baseX: n.x, baseY: n.y, vx: 0, vy: 0, fx: 0, fy: 0 }];
    }),
  );
  const springs = edges
    .filter(e => state.has(e.from) && state.has(e.to))
    .map(e => {
      const a = state.get(e.from),
        b = state.get(e.to);
      return { a, b, x: b.x - a.x, y: b.y - a.y };
    });
  const anchor = state.get(anchorId);
  const positions = () => new Map([...state].map(([id, n]) => [id, { x: n.x, y: n.y }]));
  return {
    size: state.size,
    step(position) {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return { positions: positions(), settled: true };
      const dx = position.x - anchor.baseX,
        dy = position.y - anchor.baseY;
      anchor.x = position.x;
      anchor.y = position.y;
      if (reducedMotion) {
        for (const [id, n] of state)
          if (id !== anchorId && !n.locked) {
            n.x = n.baseX + dx;
            n.y = n.baseY + dy;
          }
        return { positions: positions(), settled: true };
      }
      let energy = 0;
      for (let iteration = 0; iteration < 3; iteration++) {
        for (const n of state.values()) {
          n.fx = (n.baseX + dx - n.x) * 0.025;
          n.fy = (n.baseY + dy - n.y) * 0.025;
        }
        for (const { a, b, x, y } of springs) {
          const fx = (b.x - a.x - x) * 0.12,
            fy = (b.y - a.y - y) * 0.12;
          a.fx += fx / Math.max(1, adjacent.get(a.id).length);
          a.fy += fy / Math.max(1, adjacent.get(a.id).length);
          b.fx -= fx / Math.max(1, adjacent.get(b.id).length);
          b.fy -= fy / Math.max(1, adjacent.get(b.id).length);
        }
        energy = 0;
        for (const [id, n] of state) {
          if (id === anchorId || n.locked) continue;
          n.vx = Math.max(-30, Math.min(30, (n.vx + n.fx) * 0.76));
          n.vy = Math.max(-30, Math.min(30, (n.vy + n.fy) * 0.76));
          n.x += n.vx;
          n.y += n.vy;
          energy = Math.max(energy, Math.abs(n.vx), Math.abs(n.vy), Math.abs(n.fx), Math.abs(n.fy));
        }
      }
      return { positions: positions(), settled: energy < 0.025 };
    },
  };
}
