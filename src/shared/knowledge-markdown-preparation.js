import { tokenizeKnowledgeMarkdown } from './knowledge-markdown.js';

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
