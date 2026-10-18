export function listWindow(items, requestedPage = 0, size = 100) {
  const pageSize = Math.max(1, Math.min(200, Number(size) || 100));
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(Number(requestedPage) || 0)));
  return { items: items.slice(page * pageSize, (page + 1) * pageSize), page, pages, total: items.length };
}
