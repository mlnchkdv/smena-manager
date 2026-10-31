import { markdownBlocks } from './knowledge-blocks.js';
export function blockIdentity(raw) {
  return String(raw).match(/(?:^|\n)\^([a-zA-Z0-9_-]{1,100})[ \t]*(?:\n|$)/)?.[1] || '';
}
export function identifyBlock(source, index, id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new TypeError('Invalid block ID');
  const block = markdownBlocks(source)[index];
  if (!block || block.metadata) throw new TypeError('Invalid block');
  const existing = blockIdentity(block.raw);
  return existing
    ? { text: source, id: existing }
    : { text: source.slice(0, block.start) + block.raw.trimEnd() + `\n^${id}\n\n` + source.slice(block.end), id };
}
export function resolveKnowledgeBlock(notes, noteId, id) {
  const note = notes.find(n => n.id === noteId);
  if (!note || note.sourceFormat === 'text') return null;
  const blocks = markdownBlocks(note.formatted_markdown).filter(b => !b.metadata && blockIdentity(b.raw) === id);
  if (blocks.length !== 1) return null;
  return { source: blocks[0].raw, title: note.title, key: `note:${noteId}#^${id}` };
}
