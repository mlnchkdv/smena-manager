// Rectangles use viewport CSS pixels. Intrinsic button heights must not make
// same-row cards appear to be a new row, or a vertical list a horizontal grid.
export function spatialNeighbor(rects, at, key) {
  const current = rects[at];
  if (!current) return -1;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const x = current.left + current.width / 2,
    y = current.top + current.height / 2;
  return (
    rects
      .map((r, index) => {
        const primary = (horizontal ? r.left + r.width / 2 - x : r.top + r.height / 2 - y) * direction;
        const cross = Math.abs(horizontal ? r.top + r.height / 2 - y : r.left + r.width / 2 - x);
        const eligible = horizontal
          ? r.bottom > current.top + 1 && r.top < current.bottom - 1
          : direction > 0
            ? r.top >= current.bottom - 1
            : r.bottom <= current.top + 1;
        return { index, primary, score: primary + cross * 3, eligible };
      })
      .filter(item => item.index !== at && item.primary > 2 && item.eligible)
      .sort((a, b) => a.score - b.score)[0]?.index ?? -1
  );
}
