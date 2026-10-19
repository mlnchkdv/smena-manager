export function knowledgeView(notes, { query = '', folder = 'all', tag = '', activeId, sort = 'updated', limit = 200 } = {}) {
  const search = String(query).trim().toLocaleLowerCase();
  const selectedTag = String(tag).trim().toLocaleLowerCase();
  const time = note => {
    const value = typeof note.updatedAt === 'number' ? note.updatedAt : Date.parse(note.updatedAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  const filtered = notes
    .filter(note => !search || [note.title, note.summary, note.formatted_markdown, ...(note.tags || [])].join(' ').toLocaleLowerCase().includes(search))
    .filter(note => folder === 'all' || (folder === 'favorites' ? !!note.favorite : folder === 'root' ? !note.folderId : note.folderId === folder))
    .filter(note => !selectedTag || (note.tags || []).some(value => String(value).trim().toLocaleLowerCase() === selectedTag))
    .sort((a, b) => {
      if (Number(!!b.favorite) !== Number(!!a.favorite)) return Number(!!b.favorite) - Number(!!a.favorite);
      if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
      return time(b) - time(a);
    });
  const safeLimit = Number.isFinite(limit) ? Math.min(1000, Math.max(20, Number(limit))) : filtered.length;
  const active = filtered.find(note => note.id === activeId) || filtered[0] || null;
  const visible = filtered.slice(0, safeLimit);
  if (active && !visible.some(note => note.id === active.id)) visible.push(active);
  return { filtered, visible, active, total: filtered.length, hasMore: filtered.length > safeLimit };
}
