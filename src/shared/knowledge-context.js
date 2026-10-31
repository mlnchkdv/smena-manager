import { knowledgeDisplayParts } from './knowledge-frontmatter.js';
export function unlinkedMentions(notes, active, linkedIds = [], limit = 8) {
  const names = [active.title, ...(active.aliases || [])].filter(name => typeof name === 'string' && name.length >= 3).map(name => name.toLocaleLowerCase());
  if (!names.length) return [];
  const linked = new Set(linkedIds),
    result = [];
  for (const note of notes) {
    if (note.id === active.id || linked.has(note.id)) continue;
    const body = knowledgeDisplayParts(note)
      .body.replace(/```[\s\S]*?```/g, '')
      .replace(/\[\[[^\]]+\]\]/g, '');
    const lower = body.toLocaleLowerCase();
    const positions = names.map(name => lower.indexOf(name)).filter(i => i >= 0);
    if (!positions.length) continue;
    const at = Math.min(...positions);
    result.push({ id: note.id, title: note.title, snippet: body.slice(Math.max(0, at - 50), at + 150) });
    if (result.length >= limit) break;
  }
  return result;
}
