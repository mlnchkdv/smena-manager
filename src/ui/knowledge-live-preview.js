import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeMetadata } from './knowledge-metadata.js';
import { knowledgeReadingHtml } from './knowledge-reading.js';

export const knowledgeLivePreview = note =>
  `<div class="knowledge-quick-content" translate="no">${knowledgeReadingHtml(note, knowledgeDisplayParts(note).body)}</div>${knowledgeMetadata(note)}`;
