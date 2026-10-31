import { parseKnowledgeQuery } from './knowledge-query.js';
export const knowledgeQueryTokens = query =>
  (String(query || '').match(/"[^"]+"|\S+/g) || []).map((raw, index) => ({ raw, index, rule: parseKnowledgeQuery(raw).rules[0] }));
export const removeKnowledgeQueryToken = (query, index) =>
  knowledgeQueryTokens(query)
    .filter(token => token.index !== index)
    .map(token => token.raw)
    .join(' ');
