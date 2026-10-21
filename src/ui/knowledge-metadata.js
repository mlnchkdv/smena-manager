import { esc } from '../core/utils.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';

export function knowledgeMetadata(note, key = 'metadata') {
  const { metadata } = knowledgeDisplayParts(note);
  if (!metadata) return '';
  return `<details class="knowledge-frontmatter" ${knowledgeDisclosure(note.id, key)}><summary>Source metadata</summary><p class="hint">Hidden from reading. Preserved in the source and exports.</p><pre translate="no">${esc(metadata)}</pre></details>`;
}
