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

// Inputs are rendered CSS pixels, so hit areas do not shrink with graph zoom.
export function graphHitCandidates(points, point, radius = 22) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(radius) || radius < 0) return [];
  return points
    .map(candidate => ({ ...candidate, distance: Math.hypot(candidate.x - point.x, candidate.y - point.y) }))
    .filter(candidate => candidate.distance <= radius)
    .sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)))
    .map(candidate => candidate.id);
}
