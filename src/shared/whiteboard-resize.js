// Deltas are canvas coordinates; callers convert pointer pixels using camera zoom.
// Keep the opposite edge fixed, including when a size or coordinate limit is hit.
export function resizedWhiteboardNode(node, direction, dx, dy, step = 10, { lockAspect = false } = {}) {
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
  if (lockAspect && direction.length === 2) {
    const minScale = Math.max(
      160 / node.width,
      100 / node.height,
      direction.includes('w') ? (node.x + node.width - 50000) / node.width : 0,
      direction.includes('n') ? (node.y + node.height - 50000) / node.height : 0,
    );
    const maxScale = Math.min(
      2000 / node.width,
      2000 / node.height,
      direction.includes('w') ? (node.x + node.width + 50000) / node.width : Infinity,
      direction.includes('n') ? (node.y + node.height + 50000) / node.height : Infinity,
    );
    const scale = clamp(Math.abs(dx) / node.width >= Math.abs(dy) / node.height ? width / node.width : height / node.height, minScale, maxScale);
    width = Math.round(node.width * scale);
    height = Math.round(node.height * scale);
    x = direction.includes('w') ? node.x + node.width - width : node.x;
    y = direction.includes('n') ? node.y + node.height - height : node.y;
  }
  return { ...node, x, y, width, height };
}

export function snapWhiteboardResize(node, direction, dx, dy, others, threshold = 6) {
  const guides = [];
  const near = (axis, edge, delta) => {
    let best = threshold,
      target;
    for (const other of others) {
      if (other.id === node.id) continue;
      const start = other[axis],
        length = other[axis === 'x' ? 'width' : 'height'];
      for (const value of [start, start + length / 2, start + length]) {
        const distance = Math.abs(value - edge - delta);
        if (distance <= best) {
          best = distance;
          target = value;
        }
      }
    }
    if (target === undefined) return delta;
    guides.push({ axis, value: target });
    return target - edge;
  };
  if (direction.includes('e') || direction.includes('w')) dx = near('x', node.x + (direction.includes('e') ? node.width : 0), dx);
  if (direction.includes('n') || direction.includes('s')) dy = near('y', node.y + (direction.includes('s') ? node.height : 0), dy);
  return { dx, dy, guides };
}
