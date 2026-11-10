// Keep expanded folders within a small part of the viewport. Pagination,
// rather than a second scrolling surface, leaves touch and keyboard scrolling
// with the page; folder search still covers the entire catalogue.
export function fileFolderPageSize({ width, height, contentWidth = width }, compact = false) {
  if (width <= 640) return height < 650 ? 2 : 3;
  const columns = Math.max(1, Math.floor((contentWidth + 12) / (compact ? 242 : 262)));
  const rows = height >= 1000 ? 2 : 1;
  return Math.min(compact ? 16 : 8, columns * rows);
}
export function fileFolderPageStart(offset, total, limit) {
  return Math.min(Math.floor(Math.max(0, Number(offset) || 0) / limit) * limit, Math.max(0, Math.ceil(total / limit) - 1) * limit);
}
