export const knowledgeSearchError = () =>
  Object.assign(new Error('The knowledge search index is unavailable. Review storage migration and retry.'), {
    code: 'KNOWLEDGE_SEARCH_UNAVAILABLE',
    statusCode: 503,
  });
