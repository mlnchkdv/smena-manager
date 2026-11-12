import { prepareKnowledgeMarkdown, prepareMarkdownOpening } from '../shared/knowledge-markdown-preparation.js';
self.onmessage = ({ data }) => {
  const opening = prepareMarkdownOpening(data.source);
  if (opening) self.postMessage({ id: data.id, opening });
  self.postMessage({ id: data.id, ...prepareKnowledgeMarkdown(data.source) });
};
