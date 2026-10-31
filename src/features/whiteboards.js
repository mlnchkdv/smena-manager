import { whiteboardCatalogState, saveWhiteboardCatalog } from '../core/whiteboard-catalog-state.js';
import { A, IN, confirmDlg } from '../actions/actions.js';
import { D, S } from '../core/store.js';
import { canEditWhiteboard, canReadWhiteboard, whiteboardDocument } from '../shared/whiteboards.js';
import { canEditProject } from '../shared/project-access.js';
import { emptyWhiteboard } from '../shared/project-whiteboard.js';
import { whiteboardScope, wbText as T } from '../core/whiteboard-state.js';
import { esc, uid } from '../core/utils.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render, go } from '../shell/render.js';
import { mutate, toast } from '../ui/toast.js';
import { whiteboardCatalogControls } from '../ui/whiteboard-catalog-controls.js';
const get = id => whiteboardDocument(D(), id);
const writable = b => canEditWhiteboard(D(), b, D().me, S.ui.currentUser?.role);
function form(m, H) {
  const projects = D().projects.filter(p => !p.archived && canEditProject(p, D().me, S.ui.currentUser?.role));
  return `${H(m.id ? T('Whiteboard settings', 'Настройки холста') : T('New whiteboard', 'Новый холст'))}<div class="modal-b" translate="no"><label class="field"><span>${T('Name', 'Название')}</span><input class="input" data-in="whiteboardDocumentField" data-field="name" maxlength="160" value="${esc(m.name)}" autofocus></label><label class="field"><span>${T('Description', 'Описание')}</span><textarea class="textarea" rows="3" data-in="whiteboardDocumentField" data-field="desc" maxlength="2000">${esc(m.desc)}</textarea></label>${!m.id ? `<label class="field"><span>${T('Access and project', 'Доступ и проект')}</span><select class="select" aria-label="${T('Access and project', 'Доступ и проект')}" data-in="whiteboardDocumentField" data-field="project"><option value="">${T('Workspace members · no project', 'Участникам пространства · без проекта')}</option>${projects.map(p => `<option value="${esc(p.id)}" ${m.project === p.id ? 'selected' : ''}>${esc(p.name)} · ${T('project access', 'доступ проекта')}</option>`).join('')}</select></label>` : ''}<p class="hint">${m.project ? T('This whiteboard inherits project access. The project association is retained to protect existing permissions.', 'Холст наследует доступ проекта. Привязка сохраняется, чтобы не изменить существующие права.') : T('This whiteboard is visible to workspace members. Members with editing access can work on it together.', 'Холст виден участникам пространства. Участники с правом редактирования могут работать в нём вместе.')}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="saveWhiteboardDocument">${m.id ? T('Save', 'Сохранить') : T('Create whiteboard', 'Создать холст')}</button></div>`;
}
export function newWhiteboard(el) {
  if (!['admin', 'editor'].includes(S.ui.currentUser?.role)) return;
  const project = el?.dataset?.project || S.ui.params.project || '';
  openModal({ type: 'whiteboardTool', documentBoard: true, render: form, scope: whiteboardScope('document'), id: '', name: '', desc: '', project });
}
A.editWhiteboardDocument = el => {
  const b = get(el.dataset.id);
  if (!b || b.archived || !writable(b)) return;
  openModal({
    type: 'whiteboardTool',
    documentBoard: true,
    render: form,
    scope: whiteboardScope('document'),
    id: b.id,
    name: b.name,
    desc: b.desc,
    project: b.project,
    base: { name: b.name, desc: b.desc },
  });
};
const modal = () => {
  const m = S.ui.modals.at(-1);
  return m?.documentBoard && m.scope === whiteboardScope('document') ? m : null;
};
IN.whiteboardDocumentField = el => {
  const m = modal();
  if (m && ['name', 'desc', 'project'].includes(el.dataset.field) && (!m.id || el.dataset.field !== 'project')) {
    m[el.dataset.field] = el.value;
    if (el.dataset.field === 'project') render();
  }
};
A.saveWhiteboardDocument = () => {
  const m = modal();
  if (!m || !['admin', 'editor'].includes(S.ui.currentUser?.role)) return;
  const old = m.id && get(m.id),
    parent = D().projects.find(p => p.id === m.project);
  if (m.id && (!old || old.archived || !writable(old) || old.name !== m.base.name || old.desc !== m.base.desc)) {
    m.error = T('The whiteboard changed. Reopen its settings.', 'Холст изменился. Откройте настройки заново.');
    render();
    return;
  }
  if (
    !m.name.trim() ||
    m.name.trim().length > 160 ||
    m.desc.length > 2000 ||
    (m.project && (!parent || !canEditProject(parent, D().me, S.ui.currentUser?.role)))
  ) {
    m.error = T('Enter a name and choose an accessible project.', 'Укажите название и выберите доступный проект.');
    render();
    return;
  }
  const id = m.id || uid('wb');
  if (
    !mutate(() => {
      if (old) {
        old.name = m.name.trim();
        old.desc = m.desc.trim();
      } else {
        D().whiteboards ||= [];
        D().whiteboards.unshift({
          id,
          name: m.name.trim(),
          desc: m.desc.trim(),
          project: m.project,
          by: D().me,
          at: new Date().toISOString(),
          archived: false,
          whiteboard: emptyWhiteboard(),
        });
      }
    })
  )
    return;
  closeModal();
  go('whiteboard', { id });
};
A.toggleWhiteboardArchive = el => {
  const b = get(el.dataset.id);
  if (!b || !writable(b)) return;
  const archived = b.archived;
  confirmDlg({
    title: archived ? T('Restore whiteboard?', 'Вернуть холст из архива?') : T('Archive whiteboard?', 'Архивировать холст?'),
    body:
      esc(b.name) +
      '<p>' +
      T(
        'Cards, connections and history are retained. You can restore the whiteboard from its archive.',
        'Карточки, связи и история сохраняются. Холст можно вернуть из архива.',
      ) +
      '</p>',
    ok: archived ? T('Restore', 'Вернуть') : T('Archive', 'Архивировать'),
    run: () => {
      if (get(b.id) !== b || !writable(b) || b.archived !== archived)
        return toast(T('The whiteboard changed. Try again.', 'Холст изменился. Повторите действие.'), { kind: 'info' });
      if (
        mutate(() => {
          b.archived = !archived;
        })
      ) {
        if (!archived && S.ui.route === 'whiteboard') go('whiteboards');
        else render();
      }
    },
  });
};
IN.whiteboardsFilter = el => {
  const filter = el.dataset.field;
  if (!['query', 'project', 'sort', 'archive', 'view'].includes(filter)) return;
  S.ui.whiteboardsBrowser ||= {};
  S.ui.whiteboardsBrowser[filter] = el.value;
  S.ui.whiteboardsBrowser.scroll = 0;
  saveWhiteboardCatalog();
  S.ui.whiteboardsBrowser.limit = 50;
  if (filter === 'project' && S.ui.params.project) {
    go('whiteboards');
    return;
  }
  render();
};
A.whiteboardCatalogFilters = () =>
  openModal({
    type: 'knowledgeTool',
    render: (_m, H) =>
      `${H(T('Whiteboard filters and view', 'Фильтры и вид холстов'))}<div class="modal-b" translate="no">${whiteboardCatalogControls(
        S.ui.whiteboardsBrowser || {},
        S.ui.params.project || S.ui.whiteboardsBrowser?.project || '',
        D().projects.filter(p => !p.archived),
        true,
      )}</div><div class="modal-f" translate="no"><button class="btn btn-primary" data-a="closeModal">${T('Done', 'Готово')}</button></div>`,
  });
A.moreWhiteboards = () => {
  S.ui.whiteboardsBrowser ||= {};
  S.ui.whiteboardsBrowser.limit = (S.ui.whiteboardsBrowser.limit || 50) + 50;
  saveWhiteboardCatalog();
  render();
};
A.openWhiteboardDocument = el => {
  const b = get(el.dataset.id);
  if (canReadWhiteboard(D(), b, D().me, S.ui.currentUser?.role)) {
    const state = whiteboardCatalogState();
    state.scroll = document.getElementById('main-content')?.scrollTop || 0;
    state.restoreScroll = true;
    saveWhiteboardCatalog();
    go('whiteboard', { id: b.id });
  }
};

A.resetWhiteboardCatalog = () => {
  Object.assign(whiteboardCatalogState(), { query: '', project: '', archive: '', scroll: 0, limit: 50 });
  saveWhiteboardCatalog();
  go('whiteboards');
};
