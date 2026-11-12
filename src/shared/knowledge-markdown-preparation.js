import { tokenizeKnowledgeMarkdown } from './knowledge-markdown.js';

// A bounded opening is readable while the worker prepares the full AST. Drop
// the final lexical block: the slice may have cut a paragraph, fence or table.
export function prepareMarkdownOpening(source) {
  if (typeof source !== 'string' || source.length <= 32000) return null;
  const prefix = source.slice(0, 16000);
  try {
    const tokens = tokenizeKnowledgeMarkdown(prefix);
    tokens.pop();
    if (tokens.length && JSON.stringify(tokens).length <= 128 * 1024) return { source: prefix, tokens };
  } catch {
    /* A giant first block still has a safe literal opening. */
  }
  return { source: prefix, plain: true };
}

export function prepareKnowledgeMarkdown(source) {
  if (typeof source !== 'string' || source.length > 2 * 1024 * 1024) return { error: 'source-limit' };
  try {
    const tokens = tokenizeKnowledgeMarkdown(source);
    if (JSON.stringify(tokens).length > 12 * 1024 * 1024) return { error: 'complexity' };
    return { tokens };
  } catch {
    return { error: 'parse' };
  }
}
