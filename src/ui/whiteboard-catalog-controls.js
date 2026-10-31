import { esc } from '../core/utils.js';
import { wbText as T } from '../core/whiteboard-state.js';
export function whiteboardCatalogControls(state, project, projects, labelled = false) {
  const controls = [
    ['project', T('Project', 'Проект'), [['', T('All projects', 'Все проекты')], ...projects.map(p => [p.id, p.name])], project],
    [
      'archive',
      T('Status', 'Состояние'),
      [
        ['', T('Active', 'Активные')],
        ['archived', T('Archive', 'Архив')],
      ],
      state.archive,
    ],
    [
      'sort',
      T('Sort', 'Сортировка'),
      [
        ['updated', T('Recently updated', 'Недавно обновлённые')],
        ['name', T('Name', 'Название')],
      ],
      state.sort,
    ],
    [
      'view',
      T('Display', 'Вид'),
      [
        ['grid', T('Grid', 'Плитка')],
        ['list', T('List', 'Список')],
      ],
      state.view,
    ],
  ];
  return controls
    .map(
      ([field, label, options, value]) =>
        `${labelled ? `<label class="field"><span>${label}</span>` : ''}<select class="select" aria-label="${label}" data-in="whiteboardsFilter" data-field="${field}">${options.map(([v, name]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>${labelled ? '</label>' : ''}`,
    )
    .join('');
}
