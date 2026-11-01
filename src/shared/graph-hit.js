// Visual dots stay compact; a separate screen-space radius supports touch selection.
export function nearestGraphHit(points, point, radius = 22) {
  let nearest = null,
    distance = radius;
  for (const candidate of points) {
    const next = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (next <= distance) {
      distance = next;
      nearest = candidate.id;
    }
  }
  return nearest;
}
