import { esc } from '../core/utils.js';
import { rw } from './research-copy.js';

export function researchEvidenceForm(m) {
  const selected = m.record.data.artifacts || [];
  return `<details><summary>${rw('Files and evidence', 'Файлы и доказательства')} · ${selected.length}</summary><div class="research-form-section"><label class="field">${rw('Find a file in this project', 'Найти файл в этом проекте')}<input class="input" data-in="researchFileQuery" value="${esc(m.fileQuery || '')}" maxlength="200"></label><button class="btn btn-secondary" data-a="researchFindFiles">${rw('Find files', 'Найти файлы')}</button><p class="hint">${rw('Attach existing files without copying them. Upload new files in Files first. This does not create public access.', 'Прикрепляйте существующие файлы без копирования. Новые сначала загрузите в «Файлы». Публичный доступ не создаётся.')}</p>${selected.map(item => `<button class="btn btn-ghost" data-a="researchAttachFile" data-id="${esc(item.fileId)}">${esc(item.name || item.fileId)} · ${rw('Remove link', 'Убрать связь')}</button>`).join('')}${(m.files || []).map(file => `<button class="btn btn-secondary" data-a="researchAttachFile" data-id="${esc(file.id)}" aria-pressed="${selected.some(item => item.fileId === file.id)}">${esc(file.name)} · ${file.bytes} B${selected.some(item => item.fileId === file.id) ? ' ✓' : ''}</button>`).join('')}${m.files && !m.files.length ? `<p role="status">${rw('No matching files in this project.', 'Подходящих файлов в проекте нет.')}</p>` : ''}</div></details>`;
}
export function researchEvidenceHtml(record) {
  const items = record.data.artifacts || [];
  if (!items.length) return '';
  const slug = location.pathname.split('/')[1];
  return `<details class="research-technical"><summary>${rw('Files and evidence', 'Файлы и доказательства')} · ${items.length}</summary><ul>${items.map(item => `<li><a href="/${encodeURIComponent(slug)}/file/${encodeURIComponent(item.fileId)}">${esc(item.name || item.fileId)}</a> · ${item.bytes} B<small class="hint">${item.sha256 ? ` SHA-256: ${esc(item.sha256)}` : rw(' · Checksum unavailable', ' · Контрольная сумма недоступна')}</small></li>`).join('')}</ul></details>`;
}
