import { A, IN } from '../actions/actions.js';
import { D, S, visibleProjects } from '../core/store.js';
import { currentWhiteboard, whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { whiteboardCopyDraft, whiteboardCopySourceCurrent } from '../shared/whiteboard-extract.js';
import { canEditWhiteboard } from '../shared/whiteboards.js';
import { canEditProject } from '../shared/project-access.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { esc } from '../core/utils.js';
import { render } from '../shell/render.js';
const active = () => {
  const m = S.ui.modals.at(-1);
  return m?.whiteboardCopy && m.scope === whiteboardScope(m.source.id) ? m : null;
};
A.whiteboardExtract = el => {
  const document = currentWhiteboard();
  if (!document || !canEditWhiteboard(D(), document, D().me, S.ui.currentUser?.role)) return;
  const selection = window.getSelection(),
    origin = selection?.anchorNode?.parentElement?.closest('[data-board-id]');
  const draft = whiteboardCopyDraft(document, el.dataset.id, origin?.dataset.boardId === el.dataset.id ? selection.toString() : '');
  if (!draft) return;
  const project = visibleProjects().find(p => p.id === document.project && canEditProject(p, D().me, S.ui.currentUser?.role));
  openModal({
    type: 'whiteboardTool',
    whiteboardCopy: true,
    scope: whiteboardScope(document.id),
    ...draft,
    project: project?.id || '',
    render: (m, H) =>
      `${H(T('Create from card text', 'Создать из текста карточки'))}<div class="modal-b" translate="no"><p class="hint">${T('This creates a separate copy with a backlink. The card remains unchanged. Notes are shared in this workspace; tasks follow the selected project access.', 'Будет создана отдельная копия с обратной ссылкой. Карточка останется без изменений. Заметка доступна пространству, задача — участникам выбранного проекта.')}</p><label class="field">${T('Title', 'Название')}<input class="input" maxlength="120" data-in="whiteboardCopyField" data-field="title" value="${esc(m.title)}"></label><label class="field">${T('Text to copy', 'Текст для копирования')}<textarea class="textarea" rows="7" maxlength="6000" data-in="whiteboardCopyField" data-field="text">${esc(m.text)}</textarea></label><label class="field">${T('Task project', 'Проект для задачи')}<select class="select" data-in="whiteboardCopyField" data-field="project"><option value="">${T('Choose a project', 'Выберите проект')}</option>${visibleProjects()
        .filter(p => canEditProject(p, D().me, S.ui.currentUser?.role) && !p.archived)
        .map(p => `<option value="${esc(p.id)}" ${m.project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)
        .join(
          '',
        )}</select></label>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><span class="sp"></span><button class="btn btn-secondary" data-a="whiteboardExtractNote">${T('Create note', 'Создать заметку')}</button><button class="btn btn-primary" data-a="whiteboardExtractTask">${T('Prepare task', 'Подготовить задачу')}</button></div>`,
  });
};
IN.whiteboardCopyField = el => {
  const m = active();
  if (m && ['title', 'text', 'project'].includes(el.dataset.field)) m[el.dataset.field] = el.value;
};
function checked(task) {
  const m = active(),
    document = currentWhiteboard();
  if (!m || !document || !canEditWhiteboard(D(), document, D().me, S.ui.currentUser?.role)) return null;
  if (!whiteboardCopySourceCurrent(document, m.source))
    m.error = T('The source card changed. Reopen the copy dialog.', 'Исходная карточка изменилась. Откройте копирование заново.');
  else if (!m.title.trim() || !m.text.trim()) m.error = T('Add a title and text.', 'Добавьте название и текст.');
  else if (task && !visibleProjects().some(p => p.id === m.project && !p.archived && canEditProject(p, D().me, S.ui.currentUser?.role)))
    m.error = T('Choose a project you can edit.', 'Выберите проект с правом редактирования.');
  else return m;
  render();
  return null;
}
A.whiteboardExtractNote = async () => {
  const m = checked(false);
  if (!m) return;
  const scope = m.scope;
  await A.newKnowledgeNote(null, { whiteboardCopy: { title: m.title.trim(), text: m.text, source: { ...m.source } }, scope });
};
A.whiteboardExtractTask = () => {
  const m = checked(true);
  if (!m) return;
  closeModal();
  A.newTask({ dataset: { project: m.project } });
  Object.assign(S.ui.form, { title: m.title.trim(), desc: m.text, whiteboardSource: { ...m.source }, more: false });
  render();
};
