// Deltas are canvas coordinates; callers convert pointer pixels using camera zoom.
// Keep the opposite edge fixed, including when a size or coordinate limit is hit.
export function resizedWhiteboardNode(node, direction, dx, dy, step = 10) {
  if (!/^(n|ne|e|se|s|sw|w|nw)$/.test(direction) || ![dx, dy, step].every(Number.isFinite) || step <= 0) return { ...node };
  const snap = value => Math.round(value / step) * step;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let { x, y, width, height } = node;
  if (direction.includes('e')) width = clamp(width + snap(dx), 160, 2000);
  if (direction.includes('s')) height = clamp(height + snap(dy), 100, 2000);
  if (direction.includes('w')) {
    width = clamp(width - snap(dx), Math.max(160, x + width - 50000), Math.min(2000, x + width + 50000));
    x = node.x + node.width - width;
  }
  if (direction.includes('n')) {
    height = clamp(height - snap(dy), Math.max(100, y + height - 50000), Math.min(2000, y + height + 50000));
    y = node.y + node.height - height;
  }
  return { ...node, x, y, width, height };
}
