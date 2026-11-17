const preparedPages = new WeakMap();

export function bookmarkReaderHtml(page, bookmarkId, russian) {
  const cached = preparedPages.get(page);
  if (cached?.bookmarkId === bookmarkId && cached.russian === russian) return cached.html;
  if (!/<table(?:\s|>)/i.test(page.html)) return page.html;
  const template = document.createElement('template');
  template.innerHTML = page.html;
  template.content.querySelectorAll('table').forEach((table, index) => {
    const region = document.createElement('div');
    region.className = 'bookmark-reader-table';
    region.id = `bookmark-reader-table-${bookmarkId}-${index}`;
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', `${russian ? 'Таблица страницы' : 'Page table'} ${index + 1}`);
    table.before(region);
    region.append(table);
  });
  const html = template.innerHTML;
  preparedPages.set(page, { bookmarkId, russian, html });
  return html;
}
