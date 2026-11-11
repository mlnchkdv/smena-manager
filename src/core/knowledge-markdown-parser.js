import { prepareKnowledgeMarkdown } from '../shared/knowledge-markdown-preparation.js';
self.onmessage = ({ data }) => {
  self.postMessage({ id: data.id, ...prepareKnowledgeMarkdown(data.source) });
};
