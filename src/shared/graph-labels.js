/** Keep overview labels apart in screen coordinates; selected material has priority. */
export function graphOverviewLabels(graph, points, { width, height, selected = '', limit = 4 } = {}) {
  const degree = new Map(graph.nodes.map(node => [node.key, 0]));
  const neighbors = new Set();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
    if (edge.from === selected) neighbors.add(edge.to);
    if (edge.to === selected) neighbors.add(edge.from);
  }
  const candidates = [...graph.nodes].sort(
    (a, b) =>
      Number(b.key === selected) - Number(a.key === selected) ||
      Number(neighbors.has(b.key)) - Number(neighbors.has(a.key)) ||
      (degree.get(b.key) || 0) - (degree.get(a.key) || 0) ||
      a.key.localeCompare(b.key),
  );
  const boxes = [],
    keys = new Set();
  for (const node of candidates) {
    const point = points.get(node.key);
    if (!point) continue;
    const box = { left: point.x - 58, right: point.x + 58, top: point.y + 18, bottom: point.y + 70 };
    if (
      node.key !== selected &&
      (box.left < 6 ||
        box.right > width - 6 ||
        box.top < 6 ||
        box.bottom > height - 6 ||
        boxes.some(b => box.left < b.right + 8 && box.right > b.left - 8 && box.top < b.bottom + 8 && box.bottom > b.top - 8))
    )
      continue;
    boxes.push(box);
    keys.add(node.key);
    if (keys.size >= limit) break;
  }
  return keys;
}
