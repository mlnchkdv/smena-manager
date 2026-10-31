import { refreshWorkspaceFromServer } from '../core/bootstrap.js';
import { A, IN, handleFiles } from '../actions/actions.js';
import { D, S, visibleProjects, flushLocalSave } from '../core/store.js';
import { getSessionGeneration, downloadWorkspaceFile, commitPortableImport } from '../core/api.js';
import { ensureFileIdentities } from './file-catalog-demand.js';
import { knowledgeFileReferences } from '../shared/knowledge-assets.js';
import { entityAllowed } from '../shared/relations.js';
import { mergePortableWorkspace } from '../shared/portable-workspace.js';
import { mapArchiveFiles, ARCHIVE_LIMIT } from '../shared/knowledge-archive.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { canEditProject } from '../shared/project-access.js';
import { workspaceSyncIsClean, retryWorkspaceSync } from '../core/workspace-sync.js';
import { esc } from '../core/utils.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { kc, typeName } from '../ui/knowledge-types.js';
function workerJob(input, transfer = []) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./knowledge-archive-worker.js', import.meta.url), { type: 'module' }),
      timer = setTimeout(() => {
        worker.terminate();
        reject(Error(kc('Archive processing timed out.', 'Истекло время обработки архива.')));
      }, 30000);
    const finish = (error, value) => {
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    worker.onmessage = event => finish(event.data.error ? Error(event.data.error) : null, event.data.result);
    worker.onerror = () => finish(Error(kc('The archive could not be processed.', 'Не удалось обработать архив.')));
    worker.postMessage(input, transfer);
  });
}
function payloadFor(m) {
  const payload = mapArchiveFiles(m.review.payload, m.uploaded || {});
  if (!m.includeDefinitions) for (const key of ['knowledgeTypes', 'knowledgeTemplates', 'knowledgeQueries']) delete payload[key];
  if (!m.includeFiles && m.review.source !== 'smena') for (const note of payload.notes || []) note.assets = {};
  if (m.typeOverride) {
    const type = noteTypes(D().ws).find(t => t.id === m.typeOverride);
    for (const note of payload.notes || []) {
      note.typeId = type.id;
      note.properties = {};
      for (const field of type.fields) {
        const raw = note.sourceProperties?.[m.mapping?.[field.id] || field.id];
        let value = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
        if (field.kind === 'number') value = value.trim() && Number.isFinite(Number(value)) ? Number(value) : '';
        if (field.kind === 'checkbox') value = /^(true|yes|1)$/i.test(value);
        if (field.kind === 'date') value = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
        if (field.kind === 'project') value = m.project || '';
        if (field.kind === 'member' && !D().members.some(member => member.id === value)) value = '';
        note.properties[field.id] = typeof value === 'string' ? value.slice(0, 2000) : value;
      }
    }
  }
  return payload;
}
function form(m, H) {
  const review = m.review,
    options = noteTypes(D().ws),
    type = options.find(t => t.id === m.typeOverride),
    keys = [...new Set((review?.payload.notes || []).flatMap(n => Object.keys(n.sourceProperties || {})))].slice(0, 100);
  let result;
  try {
    if (review) result = mergePortableWorkspace(D(), payloadFor(m), { conflictPolicy: m.policy, includeDefinitions: m.includeDefinitions });
  } catch (error) {
    m.error = error.message;
  }
  const changed = result && result.counts.notes + result.counts.links > 0;
  return `${H(kc('Knowledge archive', 'Архив базы знаний'))}<div class="modal-b" translate="no"><p class="hint">${kc('Portable ZIP: Markdown/TXT, properties, connections and optional attachments. Limit: 25 MB expanded.', 'Переносимый ZIP: Markdown/TXT, свойства, связи и вложения по выбору. До 25 МБ после распаковки.')}</p><label><input type="checkbox" data-in="archiveOption" data-field="includeFiles" ${m.includeFiles ? 'checked' : ''} ${m.busy ? 'disabled' : ''}> ${kc('Include / import attachments', 'Включить / импортировать вложения')}</label><button class="btn btn-secondary" data-a="exportKnowledgeArchive" ${m.busy ? 'disabled' : ''}>${kc('Export ZIP', 'Экспорт ZIP')}</button>${S.ui.currentUser?.role !== 'viewer' ? `<label class="field">${kc('Import a Smena, Capacities or Markdown vault ZIP', 'Импорт ZIP из Смены, Capacities или Markdown-хранилища')}<input type="file" accept=".zip,application/zip" data-in="readKnowledgeArchive" ${m.busy ? 'disabled' : ''}></label>` : ''}${
    review
      ? `<p>${kc('Notes', 'Заметки')}: ${review.payload.notes?.length || 0} · ${kc('Files', 'Файлы')}: ${review.files.length} · CSV: ${review.collections || 0}</p><p>${kc('New notes', 'Новые заметки')}: ${result?.counts.notes || 0} · ${kc('Duplicates', 'Дубликаты')}: ${result?.counts.skipped || 0} · ${kc('Conflicts', 'Конфликты')}: ${result?.report.conflicts.length || 0}</p><label class="field">${kc('Duplicate handling', 'Обработка дубликатов')}<select class="select" data-in="archiveOption" data-field="policy" ${m.busy ? 'disabled' : ''}><option value="copy" ${m.policy === 'copy' ? 'selected' : ''}>${kc('Keep conflicting content as a new copy', 'Конфликтующее содержимое — новой копией')}</option><option value="skip" ${m.policy === 'skip' ? 'selected' : ''}>${kc('Skip existing items', 'Пропустить существующие записи')}</option></select></label><label class="field">${kc('Project for attachments and project fields', 'Проект для вложений и свойств проекта')}<select class="select" data-in="archiveOption" data-field="project" ${m.busy ? 'disabled' : ''}><option value="">—</option>${visibleProjects()
          .filter(p => canEditProject(p, D().me, S.ui.currentUser?.role))
          .map(p => `<option value="${esc(p.id)}" ${m.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)
          .join(
            '',
          )}</select></label><label class="field">${kc('Note type mapping', 'Сопоставление типа заметок')}<select class="select" data-in="archiveOption" data-field="typeOverride" ${m.busy ? 'disabled' : ''}><option value="">${kc('Keep imported types', 'Сохранить импортированные типы')}</option>${options.map(t => `<option value="${esc(t.id)}" ${m.typeOverride === t.id ? 'selected' : ''}>${esc(typeName(t))}</option>`).join('')}</select></label>${type?.fields.map(field => `<label class="field">${esc(typeName(field))}<select class="select" data-in="archiveMapping" data-field="${esc(field.id)}" ${m.busy ? 'disabled' : ''}><option value="">—</option>${keys.map(key => `<option value="${esc(key)}" ${(m.mapping?.[field.id] || field.id) === key ? 'selected' : ''}>${esc(key)}</option>`).join('')}</select></label>`).join('') || ''}<label><input type="checkbox" data-in="archiveOption" data-field="includeDefinitions" ${m.includeDefinitions ? 'checked' : ''} ${S.ui.currentUser?.role !== 'admin' || m.busy ? 'disabled' : ''}> ${kc('Import shared types, templates and queries (administrator)', 'Импортировать общие типы, шаблоны и подборки (администратор)')}</label><details><summary>${kc('Preview', 'Предпросмотр')}</summary>${(
          review.payload.notes || []
        )
          .slice(0, 30)
          .map(n => `<p>${esc(n.title)} · ${esc(n.sourcePath || n.typeId || '')}</p>`)
          .join(
            '',
          )}</details><p class="hint">${kc('Existing content is preserved. A backup precedes metadata import. Uploaded files remain in Files if metadata import fails; uncertain uploads are not retried automatically. Original frontmatter is retained.', 'Существующие материалы сохраняются. Перед импортом метаданных создаётся копия. При ошибке загруженные файлы остаются в разделе «Файлы»; неопределённая загрузка автоматически не повторяется. Исходные метаданные сохраняются.')}</p>`
      : ''
  }${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}${m.busy ? `<p role="status">${kc('Processing…', 'Обработка…')} ${esc(m.progress || '')}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal" ${m.busy ? 'disabled' : ''}>${kc('Close', 'Закрыть')}</button>${review ? `<button class="btn btn-primary" data-a="importKnowledgeArchive" ${m.busy || m.uncertain || !changed ? 'disabled' : ''}>${kc('Import after review', 'Импортировать после проверки')}</button>` : ''}</div>`;
}
export function openKnowledgeArchive() {
  openModal({
    type: 'knowledgeTool',
    render: form,
    includeFiles: true,
    includeDefinitions: S.ui.currentUser?.role === 'admin',
    policy: 'copy',
    mapping: {},
    uploaded: Object.create(null),
    project: '',
    typeOverride: '',
  });
}
IN.archiveOption = el => {
  const m = S.ui.modals.at(-1);
  if (!m?.busy) {
    m[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    render();
  }
};
IN.archiveMapping = el => {
  const m = S.ui.modals.at(-1);
  if (!m?.busy) {
    m.mapping[el.dataset.field] = el.value;
  }
};
IN.readKnowledgeArchive = async el => {
  const m = S.ui.modals.at(-1),
    file = el.files?.[0],
    generation = getSessionGeneration();
  if (!file || m.busy) return;
  if (file.size > ARCHIVE_LIMIT) return toast(kc('ZIP limit: 25 MB.', 'ZIP — до 25 МБ.'), { kind: 'err' });
  m.busy = true;
  m.error = '';
  render();
  try {
    const buffer = await file.arrayBuffer();
    const review = await workerJob(buffer, [buffer]);
    if (generation !== getSessionGeneration() || S.ui.modals.at(-1) !== m) return;
    m.review = review;
    m.uploaded = Object.create(null);
    m.uncertain = false;
    if (new Blob([JSON.stringify(review.payload)]).size > 3.8 * 1024 * 1024)
      throw Error(kc('Note metadata exceeds the workspace import limit. Split the archive.', 'Метаданные заметок превышают лимит импорта. Разделите архив.'));
  } catch (error) {
    m.error = error.message;
    m.review = null;
  } finally {
    m.busy = false;
    render();
  }
};
A.exportKnowledgeArchive = async () => {
  const m = S.ui.modals.at(-1),
    generation = getSessionGeneration();
  if (m.busy) return;
  m.busy = true;
  m.error = '';
  render();
  try {
    const data = {
        ws: structuredClone(D().ws),
        knowledgeNotes: structuredClone(D().knowledgeNotes),
        knowledgeFolders: structuredClone(D().knowledgeFolders),
        links: structuredClone(D().links),
        linkFolders: structuredClone(D().linkFolders),
        relations: structuredClone(D().relations || []),
      },
      files = [];
    if (m.includeFiles) {
      const ids = [...new Set(data.knowledgeNotes.flatMap(knowledgeFileReferences))];
      if (ids.length > 100) throw Error(kc('Export up to 100 referenced files at once.', 'Экспортируйте до 100 связанных файлов за раз.'));
      for (let start = 0; start < ids.length; start += 100) await ensureFileIdentities(ids.slice(start, start + 100));
      let bytes = 0;
      for (const id of ids) {
        if (generation !== getSessionGeneration()) return;
        const file = D().files.find(f => f.id === id);
        if (!file || !entityAllowed(D(), `file:${id}`, { role: S.ui.currentUser?.role, memberId: D().me }))
          throw Error(
            kc(
              'Some attachments are unavailable. Export without attachments or check access.',
              'Часть вложений недоступна. Экспортируйте без вложений или проверьте доступ.',
            ),
          );
        if (bytes + (file.bytes || 0) > ARCHIVE_LIMIT) throw Error(kc('Attachments exceed 25 MB.', 'Вложения превышают 25 МБ.'));
        const { blob } = await downloadWorkspaceFile(id, false, { maxBytes: ARCHIVE_LIMIT - bytes });
        bytes += blob.size;
        files.push({ id, name: file.name, mimeType: file.mimeType, data: new Uint8Array(await blob.arrayBuffer()) });
        m.progress = `${files.length} / ${ids.length}`;
        render();
      }
    }
    const result = await workerJob(
      { op: 'export', data, files },
      files.map(f => f.data.buffer),
    );
    if (generation !== getSessionGeneration()) return;
    const url = URL.createObjectURL(new Blob([result], { type: 'application/zip' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `smena-knowledge-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) {
    m.error = error.message;
  } finally {
    m.busy = false;
    render();
  }
};
A.importKnowledgeArchive = async () => {
  const m = S.ui.modals.at(-1),
    generation = getSessionGeneration();
  if (!m.review || m.busy || m.uncertain || S.ui.atomicOperation || S.ui.currentUser?.role === 'viewer') return;
  if (m.includeFiles && m.review.files.length && !visibleProjects().some(p => p.id === m.project && canEditProject(p, D().me, S.ui.currentUser?.role))) {
    m.error = kc('Choose a writable project for attachments.', 'Выберите проект с правом загрузки вложений.');
    return render();
  }
  m.busy = true;
  m.error = '';
  S.ui.atomicOperation = true;
  render();
  try {
    flushLocalSave();
    await retryWorkspaceSync();
    if (!workspaceSyncIsClean(D())) throw Error(kc('Wait until current changes are synchronized.', 'Дождитесь синхронизации текущих изменений.'));
    if (m.includeFiles)
      for (const file of m.review.files) {
        if (m.uploaded[file.id]) continue;
        if (generation !== getSessionGeneration()) return;
        m.progress = file.name;
        render();
        const uploaded = await handleFiles([new File([file.data], file.name, { type: file.mimeType })], { project: m.project });
        if (generation !== getSessionGeneration()) return;
        if (!uploaded?.length) {
          m.uncertain = true;
          throw Error(
            kc('Upload not confirmed. Check Files before starting another import.', 'Загрузка не подтверждена. Проверьте раздел файлов перед новым импортом.'),
          );
        }
        m.uploaded[file.id] = uploaded[0].id;
      }
    const payload = payloadFor(m);
    await commitPortableImport(payload, S.ui.workspaceRevision, m.policy, m.includeDefinitions);
    if (generation !== getSessionGeneration()) return;
    await refreshWorkspaceFromServer({ force: true });
    S.ui.atomicOperation = false;
    if (S.ui.modals.at(-1) === m) closeModal();
    toast(kc('Archive imported. A recovery backup was created.', 'Архив импортирован. Создана резервная копия.'));
  } catch (error) {
    m.error = error.message;
  } finally {
    m.busy = false;
    S.ui.atomicOperation = false;
    render();
  }
};
