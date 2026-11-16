// Screen-space label layout only. Never move cards, change titles or edges.
export function whiteboardOverviewLabels(candidates, bounds, selected = '') {
  const visible = new Set(),
    boxes = [];
  const limit = Math.max(4, Math.min(30, Math.floor((bounds.width * bounds.height) / 12000)));
  const sorted = [...candidates].sort(
    (a, b) => Number(b.id === selected) - Number(a.id === selected) || Number(!!b.frame) - Number(!!a.frame) || a.id.localeCompare(b.id),
  );
  for (const item of sorted) {
    const r = item.box;
    if (!(r.width > 0 && r.height > 0) || r.right <= bounds.left || r.left >= bounds.right || r.bottom <= bounds.top || r.top >= bounds.bottom) continue;
    if (
      item.id !== selected &&
      (visible.size >= limit ||
        r.left < bounds.left ||
        r.right > bounds.right ||
        r.top < bounds.top ||
        r.bottom > bounds.bottom ||
        boxes.some(b => r.left < b.right + 6 && r.right > b.left - 6 && r.top < b.bottom + 6 && r.bottom > b.top - 6))
    )
      continue;
    visible.add(item.id);
    boxes.push(r);
  }
  return visible;
}
