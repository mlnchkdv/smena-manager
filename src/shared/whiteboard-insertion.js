export function whiteboardInsertionPoint(point, box, view) {
  if (!point || !box || !view || ![point.x, point.y, box.left, box.top, view.x, view.y, view.zoom].every(Number.isFinite) || view.zoom <= 0) return null;
  const coordinate = value => Math.max(-49000, Math.min(49000, Math.round(value / 10) * 10));
  return { x: coordinate((point.x - box.left - view.x) / view.zoom), y: coordinate((point.y - box.top - view.y) / view.zoom) };
}
