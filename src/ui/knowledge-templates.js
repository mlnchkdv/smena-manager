import { A, IN } from '../actions/actions.js';
import { D, S, visibleProjects } from '../core/store.js';
import { uid, esc, iso } from '../core/utils.js';
import { mutate } from './toast.js';
import { openModal, closeModal } from '../overlays/modals.js';
import { render } from '../shell/render.js';
import { kc, typeName } from './knowledge-types.js';
import { noteTypes } from '../shared/knowledge-types.js';
import { validKnowledgeTemplates, templateNote } from '../shared/knowledge-templates.js';
import { knowledgeEditBlocked } from './knowledge-save-status.js';
const builtins = () => [
  {
    id: 'builtin-meeting',
    name: kc('Meeting notes', 'Протокол встречи'),
    title: kc('Meeting — {{date}}', 'Встреча — {{date}}'),
    typeId: 'meeting',
    body: kc('## Agenda\n\n## Decisions\n\n## Action items\n- [ ] ', '## Повестка\n\n## Решения\n\n## Поручения\n- [ ] '),
    properties: { date: '{{date}}' },
  },
  {
    id: 'builtin-decision',
    name: kc('Decision record', 'Запись решения'),
    title: kc('Decision — {{date}}', 'Решение — {{date}}'),
    typeId: 'decision',
    body: kc('## Context\n\n## Decision\n\n## Alternatives\n\n## Consequences', '## Контекст\n\n## Решение\n\n## Альтернативы\n\n## Последствия'),
  },
  {
    id: 'builtin-instruction',
    name: kc('Team instruction', 'Инструкция команды'),
    title: kc('Instruction', 'Инструкция'),
    typeId: 'instruction',
    body: kc('## Purpose\n\n## Steps\n1. \n\n## Verification', '## Назначение\n\n## Порядок действий\n1. \n\n## Проверка'),
  },
];
const templates = () => [...builtins(), ...(D().ws.knowledgeTemplates || [])];
function form(m, H) {
  const admin = S.ui.currentUser?.role === 'admin';
  return `${H(kc('Note templates', 'Шаблоны заметок'))}<div class="modal-b" translate="no"><label class="field">${kc('Template', 'Шаблон')}<select class="select" data-in="selectKnowledgeTemplate"><option value="">${kc('New template', 'Новый шаблон')}</option>${templates()
    .map(item => `<option value="${esc(item.id)}" ${item.id === m.item.id ? 'selected' : ''}>${esc(item.name)}</option>`)
    .join(
      '',
    )}</select></label><label class="field">${kc('Name', 'Название')}<input class="input" maxlength="80" data-in="templateField" data-field="name" value="${esc(m.item.name)}"></label><label class="field">${kc('Note title', 'Заголовок заметки')}<input class="input" maxlength="250" data-in="templateField" data-field="title" value="${esc(m.item.title)}"></label><label class="field">${kc('Type', 'Тип')}<select class="select" data-in="templateField" data-field="typeId">${noteTypes(
    D().ws,
  )
    .map(item => `<option value="${esc(item.id)}" ${item.id === m.item.typeId ? 'selected' : ''}>${esc(typeName(item))}</option>`)
    .join(
      '',
    )}</select></label><label class="field">Markdown<textarea class="textarea" rows="8" maxlength="32000" data-in="templateField" data-field="body">${esc(m.item.body)}</textarea></label><label class="field">${kc('Project for variables', 'Проект для переменных')}<select class="select" data-in="templateProject"><option value="">—</option>${visibleProjects()
    .map(project => `<option value="${esc(project.id)}" ${m.projectId === project.id ? 'selected' : ''}>${esc(project.name)}</option>`)
    .join(
      '',
    )}</select></label><p class="hint">{{date}} · {{user}} · {{project}}</p>${m.error ? `<p class="err" role="alert">${esc(m.error)}</p>` : ''}</div><div class="modal-f" translate="no"><button class="btn btn-secondary" data-a="closeModal">${kc('Cancel', 'Отмена')}</button>${admin ? `<button class="btn btn-secondary" data-a="saveKnowledgeTemplate">${kc('Save template', 'Сохранить шаблон')}</button>` : ''}<button class="btn btn-primary" data-a="createFromKnowledgeTemplate">${kc('Create note', 'Создать заметку')}</button></div>`;
}
A.noteTemplates = () => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  openModal({ type: 'knowledgeTool', render: form, item: structuredClone(builtins()[0]) });
};
IN.selectKnowledgeTemplate = el => {
  const m = S.ui.modals.at(-1);
  m.item = structuredClone(templates().find(item => item.id === el.value) || { id: uid('kt'), name: '', title: '', body: '', typeId: 'note' });
  m.error = '';
  render();
};
IN.templateField = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'knowledgeTool') m.item[el.dataset.field] = el.value;
};
IN.templateProject = el => {
  S.ui.modals.at(-1).projectId = el.value;
};
function checked(m) {
  if (!validKnowledgeTemplates([{ ...m.item, id: 'draft' }])) {
    m.error = kc('Enter a template name and keep the content under 32,000 characters.', 'Укажите название шаблона. Текст — до 32 000 символов.');
    render();
    return false;
  }
  return true;
}
A.saveKnowledgeTemplate = () => {
  if (S.ui.currentUser?.role !== 'admin' || knowledgeEditBlocked()) return;
  const m = S.ui.modals.at(-1);
  if (!checked(m)) return;
  const item = { ...m.item, id: m.item.id.startsWith('builtin-') ? uid('kt') : m.item.id };
  const items = (D().ws.knowledgeTemplates || []).filter(t => t.id !== item.id).concat(item);
  if (!validKnowledgeTemplates(items)) return;
  if (
    mutate(() => {
      D().ws.knowledgeTemplates = items;
    })
  )
    closeModal();
};
A.createFromKnowledgeTemplate = () => {
  if (S.ui.currentUser?.role === 'viewer' || knowledgeEditBlocked()) return;
  const m = S.ui.modals.at(-1);
  if (!checked(m)) return;
  const note = templateNote(m.item, {
    id: uid('kn'),
    now: new Date().toISOString(),
    day: iso(new Date()),
    author: S.prefs.name,
    memberId: D().me,
    project: visibleProjects().find(p => p.id === m.projectId)?.name || '',
    folderId: D().knowledgeFolders?.some(f => f.id === S.ui.knowledgeFolder) ? S.ui.knowledgeFolder : null,
  });
  if (
    mutate(() => {
      D().knowledgeNotes.unshift(note);
    })
  ) {
    closeModal();
    S.ui.knowledgeDrawer = note.id;
    S.ui.knowledgeDrawerView = 'edit';
    render();
  }
};
