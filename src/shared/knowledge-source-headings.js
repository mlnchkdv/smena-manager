import { Marked } from 'marked';
import { knowledgeDisplayParts } from './knowledge-frontmatter.js';
import { markdownText } from './markdown-text.js';
const markdown = new Marked();

// Offsets refer to the original UTF-16 source, including CRLF and metadata.
// Lexer tokens keep fenced code and setext headings distinct from raw text.
export function knowledgeSourceHeadings(note) {
  if (note.sourceFormat === 'text') return [];
  const source = String(note.formatted_markdown || '');
  const { body } = knowledgeDisplayParts(note);
  let offset = source.length - body.length;
  const result = [],
    occurrences = new Map();
  for (const token of markdown.lexer(body)) {
    const start = offset;
    // Marked normalizes CRLF in token.raw; walk the original string instead.
    for (let i = 0; i < token.raw.length && offset < source.length; i++) offset += source[offset] === '\r' && source[offset + 1] === '\n' ? 2 : 1;
    if (token.type === 'heading') {
      const title = markdownText(token.text).trim().slice(0, 300);
      const key = `${token.depth}:${title}`;
      const ordinal = occurrences.get(key) || 0;
      occurrences.set(key, ordinal + 1);
      result.push({ title, level: token.depth, ordinal, start, end: offset });
      if (result.length === 300) break;
    }
  }
  return result;
}
