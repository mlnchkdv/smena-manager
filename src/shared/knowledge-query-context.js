import { parseKnowledgeQuery, tokenizeKnowledgeQuery } from './knowledge-query.js';
export const knowledgeQueryTokens = query =>
  tokenizeKnowledgeQuery(query).tokens.map(({ raw }, index) => ({ raw, index, rule: parseKnowledgeQuery(raw).rules[0] }));
export const removeKnowledgeQueryToken = (query, index) =>
  knowledgeQueryTokens(query)
    .filter(token => token.index !== index)
    .map(token => token.raw)
    .join(' ');
