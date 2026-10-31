import { esc, fmtTimestamp } from '../core/utils.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
import { knowledgeVersionFits } from '../shared/knowledge-history.js';
import { KNOWLEDGE_VERSION_FIELDS, knowledgeVersionChanges, knowledgeTextComparison } from '../shared/knowledge-history.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeMetadata } from './knowledge-metadata.js';
import { knowledgeMarkdownOptions } from './knowledge-reading.js';
import { D, mem } from '../core/store.js';
import { t } from '../core/i18n.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { knowledgeCategoryLabel } from './knowledge-category.js';

function versionComparison(note, version) {
  const change = knowledgeVersionChanges(note, version, D().knowledgeFolders);
  const value = (field, data) => {
    if (field === 'folderId')
      return data
        ? folderTrail(data, D().knowledgeFolders)
            .map(folder => folder.name)
            .join(' / ') || t('Unavailable folder')
        : t('No folder');
    if (field === 'tags') return (Array.isArray(data) ? data : []).join(', ') || t('None');
    if (field === 'category') return knowledgeCategoryLabel(data) || t('None');
    return (data && typeof data === 'object' ? JSON.stringify(data) : data) || t('None');
  };
  const text = knowledgeTextComparison(note.formatted_markdown, change.restored.formatted_markdown);
  return `<section class="knowledge-version-comparison" aria-label="What will change"><h4>What will change</h4>${change.missingFolder ? '<p class="alert warn">The original folder no longer exists. This version will be restored without a folder.</p>' : ''}${
    change.fields.length
      ? `<dl class="knowledge-version-fields">${change.fields
          .filter(field => field !== 'formatted_markdown')
          .map(
            field =>
              `<div><dt>${KNOWLEDGE_VERSION_FIELDS[field]}</dt><dd><span class="hint">Current value</span><span translate="no">${esc(value(field, change.current[field]))}</span><span class="hint">Restored value</span><span translate="no">${esc(value(field, change.restored[field]))}</span></dd></div>`,
          )
          .join('')}</dl>`
      : '<p class="hint">No changes to restore.</p>'
  }${text.removed || text.added ? `<details class="knowledge-text-comparison" ${knowledgeDisclosure(note.id, `comparison:${version.id}`)}><summary>Compare text</summary><p class="hint num"><span>From line</span> ${text.line} · <span>Removed lines</span>: ${text.removed} · <span>Added lines</span>: ${text.added}</p><div class="knowledge-text-columns"><section><h5>Current text</h5><pre class="knowledge-diff-before" translate="no">${esc(text.before)}</pre></section><section><h5>Version text</h5><pre class="knowledge-diff-after" translate="no">${esc(text.after)}</pre></section></div>${text.truncated ? '<p class="hint">The changed range is shortened. Read the complete version below.</p>' : ''}</details>` : '<p class="hint">Text unchanged.</p>'}</section>`;
}
export function knowledgeHistory(note, readOnly = false) {
  return `<details class="knowledge-history" ${knowledgeDisclosure(note.id, 'history')}><summary>Version history</summary><p class="hint">Up to 5 versions are retained for notes under 32,000 characters.</p><p class="hint">Autosaves within two minutes are grouped into one version.</p>${!knowledgeVersionFits(note) ? '<p class="alert info">This note is too large for new individual versions. Use workspace backups for recovery.</p>' : ''}${
    (note.history || [])
      .map(version => {
        const historical = { ...version, id: note.id, sourceFormat: note.sourceFormat, history: [note, ...(note.history || [])] };
        const changed = knowledgeVersionChanges(note, version, D().knowledgeFolders).fields.length > 0;
        return `<div class="knowledge-history-row"><details ${knowledgeDisclosure(note.id, `version:${version.id}`)}><summary><span translate="no">${esc(version.title)} · ${esc(fmtTimestamp(version.at, true))}</span><span class="hint"> · ${version.by && mem(version.by) ? `<span translate="no">${esc(mem(version.by).name)}</span>` : '<span>Unknown member</span>'}</span></summary>${versionComparison(note, version)}<h4>Version content</h4><div class="knowledge-quick-content" translate="no">${renderKnowledgeMarkdown(knowledgeDisplayParts(historical).body, knowledgeMarkdownOptions(historical))}</div>${knowledgeMetadata(historical, `metadata:${version.id}`)}</details>${readOnly ? '' : `<button class="btn btn-secondary btn-sm" data-a="restoreKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(version.id)}" ${changed ? '' : 'disabled'}>Restore version</button>`}</div>`;
      })
      .join('') || '<p class="hint">No previous versions yet.</p>'
  }</details>`;
}
