// Keep expanded folders within a small part of the viewport. Pagination,
// rather than a second scrolling surface, leaves touch and keyboard scrolling
// with the page; folder search still covers the entire catalogue.
export function fileFolderPageSize({ width, height }, compact = false) {
  if (width <= 640) return height < 650 ? 2 : 3;
  if (height <= 500) return compact ? 4 : 2;
  if (height <= 800) return compact ? 8 : 4;
  return compact ? 16 : 8;
}
export function fileFolderPageStart(offset, total, limit) {
  return Math.min(Math.floor(Math.max(0, Number(offset) || 0) / limit) * limit, Math.max(0, Math.ceil(total / limit) - 1) * limit);
}
