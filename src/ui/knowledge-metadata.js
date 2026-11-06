import { esc } from '../core/utils.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';

export function knowledgeMetadata(note, key = 'metadata') {
  const { metadata } = knowledgeDisplayParts(note);
  if (!metadata && !note.sourceName) return '';
  return `<details class="knowledge-frontmatter" ${knowledgeDisclosure(note.id, key)}><summary>Source metadata</summary>${note.sourceName ? `<p><span>Imported filename</span>: <span translate="no">${esc(note.sourceName)}</span></p>` : ''}${metadata ? `<p class="hint">Hidden from reading. Preserved in the source and exports.</p><pre translate="no">${esc(metadata)}</pre>` : ''}</details>`;
}
