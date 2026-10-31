import { readKnowledgeArchive, buildKnowledgeArchive } from '../shared/knowledge-archive.js';
self.onmessage = event => {
  try {
    const result = event.data?.op === 'export' ? buildKnowledgeArchive(event.data.data, event.data.files) : readKnowledgeArchive(event.data);
    self.postMessage({ result }, result instanceof Uint8Array ? [result.buffer] : []);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
