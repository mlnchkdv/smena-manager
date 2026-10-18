export const GRAPH_KINDS = Object.freeze({
  note: { color: '--accent', icon: 'file-text', shape: 'round-rectangle' },
  bookmark: { color: '--amber', icon: 'bookmark', shape: 'diamond' },
  file: { color: '--teal', icon: 'paperclip', shape: 'round-rectangle' },
  project: { color: '--blue', icon: 'folder', shape: 'round-hexagon' },
  task: { color: '--text-3', icon: 'circle-check', shape: 'ellipse' },
});

export const graphTopologyKey = graph =>
  JSON.stringify([graph.nodes.map(node => node.key).sort(), graph.edges.map(edge => `${edge.from}\0${edge.to}\0${edge.type || ''}`).sort()]);

/** Deterministic component packing: no simulation jitter or positions saved in shared data. */
export function graphPositions(graph, center = '') {
  const adjacency = new Map(graph.nodes.map(node => [node.key, new Set()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  const visited = new Set(),
    components = [];
  for (const key of [...adjacency.keys()].sort()) {
    if (visited.has(key)) continue;
    const keys = [key];
    visited.add(key);
    for (let i = 0; i < keys.length; i++)
      for (const neighbor of adjacency.get(keys[i]) || [])
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          keys.push(neighbor);
        }
    keys.sort((a, b) => Number(b === center) - Number(a === center) || adjacency.get(b).size - adjacency.get(a).size || a.localeCompare(b));
    const root = keys[0],
      local = new Map([[root, { x: 0, y: 0 }]]);
    let offset = 1,
      ring = 1;
    while (offset < keys.length) {
      const count = Math.min(8 * ring, keys.length - offset),
        radius = 145 * ring;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
        local.set(keys[offset + i], { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      }
      offset += count;
      ring++;
    }
    const points = [...local.values()];
    const minX = Math.min(...points.map(point => point.x)) - 75,
      maxX = Math.max(...points.map(point => point.x)) + 75;
    const minY = Math.min(...points.map(point => point.y)) - 50,
      maxY = Math.max(...points.map(point => point.y)) + 80;
    components.push({ root, local, minX, minY, width: maxX - minX, height: maxY - minY, count: keys.length });
  }
  components.sort((a, b) => b.count - a.count || a.root.localeCompare(b.root));
  const targetWidth = Math.max(
    1,
    ...components.map(component => component.width),
    Math.sqrt(components.reduce((sum, component) => sum + component.width * component.height, 0) * 1.6),
  );
  const positions = new Map();
  let x = 0,
    y = 0,
    rowHeight = 0;
  for (const component of components) {
    if (x && x + component.width > targetWidth) {
      x = 0;
      y += rowHeight + 55;
      rowHeight = 0;
    }
    for (const [key, point] of component.local) positions.set(key, { x: x + point.x - component.minX, y: y + point.y - component.minY });
    x += component.width + 55;
    rowHeight = Math.max(rowHeight, component.height);
  }
  return positions;
}
