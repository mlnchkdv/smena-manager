/** Screen-space candidates; overlapping hit areas are resolved by an explicit chooser. */
export function whiteboardPickCandidates(nodes, point, view) {
  const zoom = Number(view.zoom);
  if (!(zoom > 0) || ![point.x, point.y, view.x, view.y].every(Number.isFinite)) return [];
  return nodes
    .filter(node => {
      const left = view.x + node.x * zoom,
        top = view.y + node.y * zoom;
      const width = node.width * zoom,
        height = node.height * zoom;
      const dx = Math.max(0, (44 - width) / 2),
        dy = Math.max(0, (44 - height) / 2);
      if (point.x < left - dx || point.x > left + width + dx || point.y < top - dy || point.y > top + height + dy) return false;
      return node.type !== 'group' || point.y <= top + 44 || Math.min(point.x - left, left + width - point.x, top + height - point.y) <= 12;
    })
    .sort((a, b) => Number(a.type === 'group') - Number(b.type === 'group') || a.width * a.height - b.width * b.height || a.id.localeCompare(b.id))
    .map(node => node.id);
}
