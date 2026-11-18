export const WHITEBOARD_PDF_PAGE_BATCH = 12;
const width = 360;
const height = 460;
const gap = 32;
const boundary = 50000;

// Find room for the whole grid before placing cards. A frame is treated like
// any other occupied area so these cards don't accidentally become its contents.
export function whiteboardPdfPagePositions(nodes, source, count) {
  if (!Number.isInteger(count) || count < 1 || count > WHITEBOARD_PDF_PAGE_BATCH) return null;
  const columns = Math.min(3, count);
  const gridWidth = columns * (width + gap) - gap;
  const gridHeight = Math.ceil(count / columns) * (height + gap) - gap;
  const clampX = x => Math.max(-boundary, Math.min(boundary - gridWidth, x));
  const clampY = y => Math.max(-boundary, Math.min(boundary - gridHeight, y));
  const x = clampX(source.x);
  const y = clampY(source.y);
  const candidates = [source, ...nodes.filter(node => node.id !== source.id)].flatMap(node => [
    { x, y: node.y + node.height + gap },
    { x: node.x + node.width + gap, y },
    { x, y: node.y - gridHeight - gap },
    { x: node.x - gridWidth - gap, y },
  ]);
  const corners = candidates.filter(point => point.x === clampX(point.x) && point.y === clampY(point.y));
  // Try the space immediately alongside the source first. If those slots are
  // occupied, prefer the closest clear rectangle along the same axes.
  const nearby = candidates.slice(0, 4).filter(point => corners.includes(point));
  const distance = point => Math.hypot(point.x - x, point.y - y);
  const start = [...nearby, ...corners.sort((a, b) => distance(a) - distance(b))].find(
    point =>
      !nodes.some(
        node =>
          point.x < node.x + node.width + gap &&
          point.x + gridWidth + gap > node.x &&
          point.y < node.y + node.height + gap &&
          point.y + gridHeight + gap > node.y,
      ),
  );
  if (!start) return null;
  return Array.from({ length: count }, (_, index) => ({
    x: start.x + (index % columns) * (width + gap),
    y: start.y + Math.floor(index / columns) * (height + gap),
    width,
    height,
  }));
}
