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

export function bindWikiReferences(notes = []) {
  const titles = new Map();
  for (const note of notes) {
    const key = normalizedTitle(note.title);
    if (key) titles.set(key, [...(titles.get(key) || []), note.id]);
  }
  for (const note of notes) {
    const previous = Array.isArray(note.wikiRefs) ? note.wikiRefs : [];
    const labels = linksForNote(note);
    if (!labels.length && !Object.hasOwn(note, 'wikiRefs')) continue;
    note.wikiRefs = labels.map(label => {
      const bound = previous.find(ref => normalizedTitle(ref.label) === normalizedTitle(label));
      const matches = titles.get(normalizedTitle(label)) || [];
      return { label, target: bound?.target || (matches.length === 1 ? matches[0] : '') };
    });
  }
  return notes;
}

export function knowledgeRelations(notes, activeNote) {
  const collection = Array.isArray(notes) ? notes : [];
  if (!activeNote) return { outgoing: [], backlinks: [] };
  // Match the graph's persisted identity semantics, without mutating the note
  // or cloning every large Markdown body on each preview render.
  const bound = bindWikiReferences(collection.map(note => ({ ...note })));
  const byId = new Map(collection.map(note => [note.id, note]));
  const source = bound.find(note => note.id === activeNote.id);
  const outgoing = (source?.wikiRefs || []).map(ref => ({ title: ref.label, note: byId.get(ref.target) || null }));
  const backlinks = bound.filter(note => note.id !== activeNote.id && note.wikiRefs?.some(ref => ref.target === activeNote.id)).map(note => byId.get(note.id));
  return { outgoing, backlinks };
}
