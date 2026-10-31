import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { folderTrail } from '../shared/knowledge-tools.js';
import { knowledgeVersionFits } from '../shared/knowledge-history.js';

export function knowledgeImportReview(preview, folders) {
  if (!preview.entries) return '';
  const notes = new Map(preview.result.data.knowledgeNotes.map(note => [note.id, note]));
  const destination =
    folderTrail(preview.destination, folders)
      .map(folder => folder.name)
      .join(' / ') || t('No folder');
  return `<div class="knowledge-import-review"><p><span>Destination folder</span>: <strong translate="no">${esc(destination)}</strong></p>
    ${preview.batches ? `<p class="hint">${t('Files are read in batches of 50. Nothing is saved until you confirm the complete review.')}</p>` : ''}
    ${preview.files && preview.entries.some(entry => entry.error) ? `<button class="btn btn-secondary btn-sm" data-a="retryKnowledgeImport">${t('Retry failed files')}</button>` : ''}
    ${preview.entries.some(entry => entry.error) ? '<p class="alert info">Some files could not be read. Only the valid notes below will be imported.</p>' : ''}
    <ul>${preview.entries
      .map(entry => {
        const note = notes.get(entry.id);
        return `<li><strong translate="no">${esc(entry.name)}</strong>${entry.error ? `<span class="bad">${esc(t(entry.error))}</span>` : `<span>${note ? t('Ready to import') : t('Duplicate skipped')}</span>${note ? `<span translate="no">${esc(note.title)}</span>${!knowledgeVersionFits(note) ? '<small class="warn">' + t('No new individual versions for this large note. Keep its source for recovery.') + '</small>' : ''}` : ''}`}</li>`;
      })
      .join('')}</ul><p class="hint">Each file becomes a note. Review duplicates before importing.</p></div>`;
}
