import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { folderTrail } from '../shared/knowledge-tools.js';

export function knowledgeImportReview(preview, folders) {
  if (!preview.entries) return '';
  const notes = new Map(preview.result.data.knowledgeNotes.map(note => [note.id, note]));
  const destination =
    folderTrail(preview.destination, folders)
      .map(folder => folder.name)
      .join(' / ') || t('No folder');
  return `<div class="knowledge-import-review"><p><span>Destination folder</span>: <strong translate="no">${esc(destination)}</strong></p>
    ${preview.entries.some(entry => entry.error) ? '<p class="alert info">Some files could not be read. Only the valid notes below will be imported.</p>' : ''}
    <ul>${preview.entries
      .map(entry => {
        const note = notes.get(entry.id);
        return `<li><strong translate="no">${esc(entry.name)}</strong>${entry.error ? `<span class="bad">${esc(t(entry.error))}</span>` : `<span>${note ? t('Ready to import') : t('Duplicate skipped')}</span>${note ? `<span translate="no">${esc(note.title)}</span>` : ''}`}</li>`;
      })
      .join('')}</ul><p class="hint">Each file becomes a note. Review duplicates before importing.</p></div>`;
}
