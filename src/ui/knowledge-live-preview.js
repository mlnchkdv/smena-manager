import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeMetadata } from './knowledge-metadata.js';

export const knowledgeLivePreview = note =>
  `<div class="knowledge-quick-content" translate="no">${renderKnowledgeMarkdown(knowledgeDisplayParts(note).body)}</div>${knowledgeMetadata(note)}`;
