import { esc, fmtTimestamp } from '../core/utils.js';
import { renderKnowledgeMarkdown } from '../shared/knowledge-markdown.js';
import { knowledgeDisclosure } from './knowledge-disclosure.js';
import { knowledgeVersionFits } from '../shared/knowledge-history.js';
import { KNOWLEDGE_VERSION_FIELDS, knowledgeVersionChanges, knowledgeTextComparison } from '../shared/knowledge-history.js';
import { knowledgeDisplayParts } from '../shared/knowledge-frontmatter.js';
import { knowledgeMetadata } from './knowledge-metadata.js';
import { knowledgeMarkdownOptions } from './knowledge-reading.js';
import { D, S, mem } from '../core/store.js';
import { t, isRussian } from '../core/i18n.js';
import { knowledgeVersionState } from '../core/knowledge-version-state.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { knowledgeCategoryLabel } from './knowledge-category.js';
import { A } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { getSessionGeneration } from '../core/api.js';

const previewKey = (noteId, versionId) => JSON.stringify([getSessionGeneration(), noteId, versionId]);
const previewLimit = (noteId, versionId) => S.ui.knowledgeVersionPreview?.[previewKey(noteId, versionId)] || 24000;
A.refreshKnowledgeHistory = () => render();
A.moreKnowledgeVersionPreview = el => {
  const note = D().knowledgeNotes.find(note => note.id === el.dataset.id);
  const reference = note?.history?.find(version => version.id === el.dataset.version);
  if (!reference || !knowledgeVersionState(note.id, reference).value) return;
  S.ui.knowledgeVersionPreview = Object.fromEntries(
    [
      ...Object.entries(S.ui.knowledgeVersionPreview || {}),
      [previewKey(note.id, reference.id), Math.min(100000, previewLimit(note.id, reference.id) + 24000)],
    ].slice(-20),
  );
  render();
};

function versionComparison(note, version, change) {
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
export function knowledgeHistory(note, readOnly = false, expanded = false) {
  const text = (en, ru) => (isRussian() ? ru : en);
  const versions = note.history || [];
  const visible = S.ui.knowledgeHistoryVisible?.[note.id] || 5;
  const open = section => (S.ui.knowledgeOpenSections || []).includes(`${note.id}:${section}`);
  if (!expanded && !open('history'))
    return `<details class="knowledge-history" ${knowledgeDisclosure(note.id, 'history')}><summary data-a="refreshKnowledgeHistory">Version history</summary></details>`;
  return `<details class="knowledge-history" ${expanded ? 'open' : knowledgeDisclosure(note.id, 'history')}><summary ${expanded ? '' : 'data-a="refreshKnowledgeHistory"'}>Version history</summary><p class="hint" translate="no">${text('Up to 20 previous versions. Snapshots are stored separately, up to 8 MiB each; workspace history budget: 256 MiB. Nothing is deleted automatically from Drive.', 'До 20 предыдущих версий. Снимки хранятся отдельно, до 8 МиБ каждый; бюджет истории пространства — 256 МиБ. Автоматического удаления с Диска нет.')}</p><p class="hint">Autosaves within two minutes are grouped into one version.</p>${!knowledgeVersionFits(note) ? `<p class="alert info" translate="no">${text('This snapshot exceeds the version budget. Shorten it or download the source before editing.', 'Снимок превышает бюджет версии. Сократите его или скачайте исходник перед редактированием.')}</p>` : ''}${
    versions
      .slice(0, visible)
      .map(reference => {
        const state = knowledgeVersionState(note.id, reference);
        const version = state.value;
        const title = version?.title || reference.title || text('Saved version', 'Сохранённая версия');
        const heading = `<span translate="no">${esc(title)} · ${esc(fmtTimestamp(reference.at, true))}</span><span class="hint"> · ${reference.by && mem(reference.by) ? `<span translate="no">${esc(mem(reference.by).name)}</span>` : '<span>Unknown member</span>'}</span>`;
        if (!version)
          return `<div class="knowledge-history-row" data-knowledge-version="${esc(reference.id)}"><div>${heading}<button class="btn btn-secondary btn-sm" data-a="loadKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(reference.id)}" ${state.loading ? 'disabled' : ''} translate="no">${state.loading ? text('Loading…', 'Загрузка…') : state.error ? text('Retry version', 'Повторить чтение') : text('View version', 'Посмотреть версию')}</button></div></div>`;
        const historical = { ...version, id: note.id, sourceFormat: note.sourceFormat, history: [note, ...versions] };
        if (!open(`version:${reference.id}`))
          return `<div class="knowledge-history-row" data-knowledge-version="${esc(reference.id)}"><details ${knowledgeDisclosure(note.id, `version:${reference.id}`)}><summary data-a="refreshKnowledgeHistory">${heading}</summary></details></div>`;
        const changes = knowledgeVersionChanges(note, version, D().knowledgeFolders);
        const changed = changes.fields.length > 0;
        const body = knowledgeDisplayParts(historical).body;
        const limit = previewLimit(note.id, reference.id);
        const actions = `<div class="knowledge-version-actions"><button class="btn btn-ghost btn-sm" data-a="downloadKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(reference.id)}" translate="no">${text('Download this version', 'Скачать эту версию')}</button>${readOnly ? '' : `<button class="btn btn-secondary btn-sm" data-a="restoreKnowledgeVersion" data-id="${esc(note.id)}" data-version="${esc(reference.id)}" ${changed ? '' : 'disabled'}>Restore version</button>`}</div>`;
        return `<div class="knowledge-history-row" data-knowledge-version="${esc(reference.id)}"><details ${knowledgeDisclosure(note.id, `version:${reference.id}`)}><summary data-a="refreshKnowledgeHistory">${heading}</summary>${versionComparison(note, version, changes)}${actions}<h4>Version content</h4><div class="knowledge-quick-content" tabindex="0" role="region" aria-label="${esc(t('Version content'))}" translate="no">${renderKnowledgeMarkdown(body.slice(0, limit), knowledgeMarkdownOptions(historical))}</div>${body.length > limit ? `<p class="hint" translate="no">${text('Preview shortened. Download the complete version to read every byte.', 'Предпросмотр сокращён. Скачайте полную версию для чтения всего текста.')}</p>` : ''}${body.length > limit && limit < 100000 ? `<button class="btn btn-secondary btn-sm" data-a="moreKnowledgeVersionPreview" data-id="${esc(note.id)}" data-version="${esc(reference.id)}" translate="no">${text('Show more preview', 'Показать ещё')}</button>` : ''}${knowledgeMetadata(historical, `metadata:${version.id}`)}</details></div>`;
      })
      .join('') || '<p class="hint">No previous versions yet.</p>'
  }${versions.length > visible ? `<button class="btn btn-secondary btn-sm" data-a="moreKnowledgeVersions" data-id="${esc(note.id)}" translate="no">${text('Show more versions', 'Ещё версии')} · ${Math.min(visible, versions.length)} / ${versions.length}</button>` : ''}</details>`;
}
