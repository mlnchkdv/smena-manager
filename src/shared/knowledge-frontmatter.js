import { parseMarkdownFrontmatter } from './markdown-import.js';

// Provenance is explicit for new imports. For older notes, only recognize a
// metadata block corroborated by the note's stored fields; never rewrite data.
export function knowledgeDisplayParts(note) {
  const source = String(note.formatted_markdown || '');
  if (note.sourceFormat === 'text') return { body: source, metadata: '' };
  const normalized = source.replace(/^\uFEFF/, '');
  const { frontmatter, body } = parseMarkdownFrontmatter(normalized);
  if (body === normalized || !Object.keys(frontmatter).length) return { body: source, metadata: '' };
  const sameField = field => typeof frontmatter[field] === 'string' && frontmatter[field].trim() !== '' && frontmatter[field] === note[field];
  const legacyMarkdown =
    sameField('summary') ||
    (sameField('category') && note.category !== 'Imported') ||
    (sameField('title') && note.category === 'Imported' && typeof note.summary === 'string' && !!note.summary.trim());
  if (note.sourceFormat !== 'markdown' && !legacyMarkdown) return { body: source, metadata: '' };
  return { body, metadata: normalized.slice(0, normalized.length - body.length).trimEnd() };
}
