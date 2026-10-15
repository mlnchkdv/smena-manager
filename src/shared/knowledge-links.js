const text = value => (typeof value === 'string' ? value.trim() : '');
const normalizedTitle = value => cleanWikiTitle(value).toLocaleLowerCase('ru-RU');

export function cleanWikiTitle(value) {
  return text(value).replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
}

export function extractWikiLinks(markdown) {
  const links = [];
  const seen = new Set();
  for (const match of String(markdown || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
    const title = cleanWikiTitle(match[1]);
    const key = normalizedTitle(title);
    if (!title || seen.has(key)) continue;
    seen.add(key);
    links.push(title);
  }
  return links;
}

function linksForNote(note) {
  const links = [...(Array.isArray(note?.wikilinks) ? note.wikilinks : []), ...extractWikiLinks(note?.formatted_markdown)];
  const seen = new Set();
  return links.map(cleanWikiTitle).filter(title => {
    const key = normalizedTitle(title);
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function knowledgeRelations(notes, activeNote) {
  const collection = Array.isArray(notes) ? notes : [];
  if (!activeNote) return { outgoing: [], backlinks: [] };
  const byTitle = new Map(collection.map(note => [normalizedTitle(note.title), note]).filter(([title]) => title));
  const outgoing = linksForNote(activeNote).map(title => ({ title, note: byTitle.get(normalizedTitle(title)) || null }));
  const activeTitle = normalizedTitle(activeNote.title);
  const backlinks = activeTitle
    ? collection.filter(note => note.id !== activeNote.id && linksForNote(note).some(title => normalizedTitle(title) === activeTitle))
    : [];
  return { outgoing, backlinks };
}
