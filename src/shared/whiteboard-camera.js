// Keep navigation cameras inside the same range as zoom gestures and saved layouts.
export function whiteboardNodeCamera(node, viewport) {
  if (
    !node ||
    !viewport ||
    ![node.x, node.y, node.width, node.height, viewport.width, viewport.height].every(Number.isFinite) ||
    Math.min(node.width, node.height, viewport.width, viewport.height) <= 0
  )
    return null;
  const zoom = Math.max(0.2, Math.min(1, (viewport.width - 48) / node.width, (viewport.height - 48) / node.height));
  return {
    zoom,
    x: viewport.width / 2 - (node.x + node.width / 2) * zoom,
    y: viewport.height / 2 - (node.y + node.height / 2) * zoom,
  };
}
