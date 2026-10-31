import { A, IN, handleFiles } from '../actions/actions.js';
import { D, S, visibleProjects } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { canEditProject } from '../shared/project-access.js';
import { esc, uid } from '../core/utils.js';
import { kc } from '../ui/knowledge-types.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { mutate, toast } from '../ui/toast.js';
import { knowledgeEditBlocked } from '../ui/knowledge-save-status.js';
function form(m, H) {
  return `${H(kc('Quick capture', 'Быстрый сбор'))}<div class="modal-b" translate="no"><label class="field">${kc('Workspace (choose before typing)', 'Пространство (выберите до ввода)')}<select class="select" data-in="captureWorkspace">${(
    S.ui.availableWorkspaces || []
  )
    .filter(w => !w.archived)
    .map(w => `<option value="${esc(w.id)}" ${w.id === S.ui.activeWorkspace ? 'selected' : ''}>${esc(w.name)}</option>`)
    .join(
      '',
    )}</select></label><label class="field">${kc('Project', 'Проект')}<select class="select" data-in="captureField" data-field="project"><option value="">—</option>${visibleProjects()
    .filter(p => canEditProject(p, D().me, S.ui.currentUser?.role))
    .map(p => `<option value="${esc(p.id)}" ${m.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)
    .join(
      '',
    )}</select></label><label class="field">${kc('Title', 'Название')}<input class="input" maxlength="250" data-in="captureField" data-field="title" value="${esc(m.title)}"></label><label class="field">${kc('Text or web link', 'Текст или ссылка')}<textarea class="textarea" rows="6" maxlength="32000" data-in="captureField" data-field="text">${esc(m.text)}</textarea></label><label class="field">${kc('Files and images (project required)', 'Файлы и изображения (нужен проект)')}<input type="file" multiple data-in="captureFiles"></label><span class="hint">${(m.files || []).map(f => esc(f.name)).join(', ')}</span><p class="hint">${kc('Saved to To process, separate from notification Inbox.', 'Сохраняется в подборку «На разбор», отдельно от входящих уведомлений.')}</p>${m.error ? `<p role="alert" class="err">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="saveQuickCapture">${kc('Capture', 'Сохранить на разбор')}</button></div>`;
}
export function openCapture() {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  S.ui.pop = null;
  openModal({ type: 'knowledgeTool', render: form, title: '', text: '', project: '', files: [] });
}
IN.captureField = el => {
  S.ui.modals.at(-1)[el.dataset.field] = el.value;
};
IN.captureFiles = el => {
  S.ui.modals.at(-1).files = [...el.files].slice(0, 20);
};
IN.captureWorkspace = async el => {
  const m = S.ui.modals.at(-1);
  if (m.text || m.title || m.files?.length) {
    m.error = kc('Save this capture before changing workspace.', 'Сохраните материал до смены пространства.');
    return render();
  }
  closeModal();
  await A.switchWs({ dataset: { v: el.value } });
};
A.saveQuickCapture = async () => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const m = S.ui.modals.at(-1);
  if (!m.text.trim() && !m.files?.length) {
    m.error = kc('Add text, a link or files.', 'Добавьте текст, ссылку или файлы.');
    return render();
  }
  if (m.files?.length && !visibleProjects().some(p => p.id === m.project && canEditProject(p, D().me, S.ui.currentUser?.role))) {
    m.error = kc('Choose a project you can edit.', 'Выберите проект с правом редактирования.');
    return render();
  }
  const generation = getSessionGeneration();
  closeModal();
  const files = m.files?.length ? await handleFiles(m.files, { project: m.project }) : [];
  if (generation !== getSessionGeneration() || knowledgeEditBlocked()) return;
  if (m.files?.length && !files?.length)
    return toast(kc('No files were uploaded. Capture was not created.', 'Файлы не загружены. Материал не создан.'), { kind: 'err' });
  const body = [
    m.text,
    ...(files || []).map(f => `[[file:${f.id}|${f.name}]]`),
    m.project ? `[[project:${m.project}|${visibleProjects().find(p => p.id === m.project)?.name || m.project}]]` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  mutate(() =>
    D().knowledgeNotes.unshift({
      id: uid('kn'),
      title: m.title.trim() || kc('Captured material', 'Материал на разбор'),
      formatted_markdown: body,
      tags: [],
      folderId: null,
      captureStatus: 'unprocessed',
      updatedAt: new Date().toISOString(),
      updatedBy: D().me,
    }),
  );
};
A.finishKnowledgeCapture = el => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const note = D().knowledgeNotes.find(n => n.id === el.dataset.id);
  if (note)
    mutate(() => {
      note.captureStatus = 'processed';
      note.updatedAt = new Date().toISOString();
      note.updatedBy = D().me;
    });
};
