import { esc, fmtTimestamp } from '../core/utils.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
import { knowledgeVersionFits } from '../shared/knowledge-history.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeMetadata } from './knowledge-metadata.js';
import { knowledgeMarkdownOptions } from './knowledge-reading.js';
export function knowledgeHistory(note, readOnly = false) {
  return `<details class="knowledge-history" ${knowledgeDisclosure(note.id, 'history')}><summary>Version history</summary><p class="hint">Up to 5 versions are retained for notes under 32,000 characters.</p><p class="hint">Autosaves within two minutes are grouped into one version.</p>${!knowledgeVersionFits(note) ? '<p class="alert info">This note is too large for new individual versions. Use workspace backups for recovery.</p>' : ''}${
    (note.history || [])
      .map(version => {
        const historical = { ...version, id: note.id, sourceFormat: note.sourceFormat, history: [note, ...(note.history || [])] };
        return `<div class="knowledge-history-row"><details ${knowledgeDisclosure(note.id, `version:${version.id}`)}><summary translate="no">${esc(version.title)} · ${esc(fmtTimestamp(version.at, true))}</summary><div class="knowledge-quick-content" translate="no">${renderKnowledgeMarkdown(knowledgeDisplayParts(historical).body, knowledgeMarkdownOptions(historical))}</div>${knowledgeMetadata(historical, `metadata:${version.id}`)}</details>${readOnly ? '' : `<button class="btn btn-secondary btn-sm" data-a="restoreKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(version.id)}">Restore version</button>`}</div>`;
      })
      .join('') || '<p class="hint">No previous versions yet.</p>'
  }</details>`;
}
