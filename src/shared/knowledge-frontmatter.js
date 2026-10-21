import { parseMarkdownFrontmatter } from './markdown-import.js';

// Provenance is explicit for new imports. For older notes, only recognize a
// metadata block corroborated by stored fields or a retained version of the
// same block. Renaming a note must not turn its import metadata into body text.
const corroborates = (frontmatter, note) => {
  const sameField = field => typeof frontmatter[field] === 'string' && frontmatter[field].trim() !== '' && frontmatter[field] === note[field];
  return (
    sameField('summary') ||
    (sameField('category') && note.category !== 'Imported') ||
    (sameField('title') && note.category === 'Imported' && typeof note.summary === 'string' && !!note.summary.trim())
  );
};
const metadataBlock = (source, body) => source.slice(0, source.length - body.length).trimEnd();
export function knowledgeDisplayParts(note) {
  const source = String(note.formatted_markdown || '');
  if (note.sourceFormat === 'text') return { body: source, metadata: '' };
  const normalized = source.replace(/^\uFEFF/, '');
  const { frontmatter, body } = parseMarkdownFrontmatter(normalized);
  if (body === normalized || !Object.keys(frontmatter).length) return { body: source, metadata: '' };
  const metadata = metadataBlock(normalized, body);
  const legacyMarkdown =
    corroborates(frontmatter, note) ||
    (Array.isArray(note.history) &&
      note.history.slice(0, 6).some(version => {
        if (!version || version.sourceFormat === 'text' || typeof version.formatted_markdown !== 'string') return false;
        const previousSource = version.formatted_markdown.replace(/^\uFEFF/, '');
        const previous = parseMarkdownFrontmatter(previousSource);
        return previous.body !== previousSource && metadataBlock(previousSource, previous.body) === metadata && corroborates(frontmatter, version);
      }));
  if (note.sourceFormat !== 'markdown' && !legacyMarkdown) return { body: source, metadata: '' };
  return { body, metadata };
}
