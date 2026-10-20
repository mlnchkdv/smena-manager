import { esc, fmtTimestamp } from '../core/utils.js';
export function knowledgeHistory(note, readOnly = false) {
  return `<details class="knowledge-history"><summary>Version history</summary><p class="hint">Up to 5 versions are retained for notes under 32,000 characters.</p>${(note.history || []).map(version => `<div class="knowledge-history-row"><span translate="no">${esc(version.title)} · ${esc(fmtTimestamp(version.at, true))}</span>${readOnly ? '' : `<button class="btn btn-secondary btn-sm" data-a="restoreKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(version.id)}">Restore version</button>`}</div>`).join('') || '<p class="hint">No previous versions yet.</p>'}</details>`;
}
