export function knowledgeView(notes, { query = '', folder = 'all', activeId } = {}) {
  const search = String(query).trim().toLocaleLowerCase();
  const time = note => {
    const value = typeof note.updatedAt === 'number' ? note.updatedAt : Date.parse(note.updatedAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  const filtered = notes
    .filter(note => !search || [note.title, note.summary, note.formatted_markdown, ...(note.tags || [])].join(' ').toLocaleLowerCase().includes(search))
    .filter(note => folder === 'all' || (folder === 'root' ? !note.folderId : note.folderId === folder))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || time(b) - time(a));
  return { filtered, active: filtered.find(note => note.id === activeId) || filtered[0] || null };
}
