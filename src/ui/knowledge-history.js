import { esc, fmtTimestamp } from '../core/utils.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
export function knowledgeHistory(note, readOnly = false) {
  return `<details class="knowledge-history" ${knowledgeDisclosure(note.id, 'history')}><summary>Version history</summary><p class="hint">Up to 5 versions are retained for notes under 32,000 characters.</p>${(note.history || []).map(version => `<div class="knowledge-history-row"><details ${knowledgeDisclosure(note.id, `version:${version.id}`)}><summary translate="no">${esc(version.title)} · ${esc(fmtTimestamp(version.at, true))}</summary><div class="knowledge-quick-content" translate="no">${renderKnowledgeMarkdown(version.formatted_markdown)}</div></details>${readOnly ? '' : `<button class="btn btn-secondary btn-sm" data-a="restoreKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(version.id)}">Restore version</button>`}</div>`).join('') || '<p class="hint">No previous versions yet.</p>'}</details>`;
}
