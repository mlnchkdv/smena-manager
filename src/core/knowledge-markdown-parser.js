import { tokenizeKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
self.onmessage = ({ data }) => {
  try {
    if (typeof data.source !== 'string' || data.source.length > 2 * 1024 * 1024) throw Error('limit');
    const tokens = tokenizeKnowledgeMarkdown(data.source);
    if (JSON.stringify(tokens).length > 12 * 1024 * 1024) throw Error('complexity');
    self.postMessage({ id: data.id, tokens });
  } catch {
    self.postMessage({ id: data.id, error: true });
  }
};
