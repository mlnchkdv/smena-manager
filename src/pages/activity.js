import { activityMatcher, activityRangeValid } from '../shared/activity-view.js';
import { calendarDate } from '../shared/calendar-time.js';
import { isRussian } from '../core/i18n.js';
const T = (en, ru) => (isRussian() ? ru : en);
/* ---------- ACTIVITY ---------- */
import { collectionView, collectionPage, saveCollectionView, resetCollectionView } from '../core/collection-view-state.js';
import { dayBucket, esc, fmtTimestamp } from '../core/utils.js';
import { D, S, canSee, proj } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { activityFeed, activityGroupingControl } from '../ui/activity-feed.js';
import { segmentedControl } from '../ui/segmented-control.js';
import { A, IN } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { listWindow } from '../shared/list-window.js';
import { paginationHtml } from '../ui/pagination.js';
import { disclosureAttributes } from '../ui/disclosure.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { activityPresetFilters } from '../shared/activity-presets.js';
import { openModal, closeModal } from '../overlays/modals.js';
for (const key of ['actFrom', 'actTo'])
  IN[key] = el => {
    S.ui[key] = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : '';
    S.ui.actPeriod = '';
    render();
  };
A.resetActivityDates = () => {
  S.ui.actFrom = '';
  S.ui.actTo = '';
  S.ui.actPeriod = '';
  render();
};
IN.actQuery = el => {
  S.ui.actQuery = el.value.slice(0, 500);
  render();
};
IN.actProject = el => {
  S.ui.actProject = el.value;
  render();
};
IN.actType = el => {
  S.ui.actFilter = el.value;
  render();
};
A.activityPeriod = el => {
  const today = calendarDate(new Date(), S.prefs.tz),
    start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - Math.max(0, Number(el.dataset.days) - 1));
  S.ui.actFrom = start.toISOString().slice(0, 10);
  S.ui.actTo = today;
  S.ui.actPeriod = String(el.dataset.days);
  render();
};
const activityDefaults = { actFilter: 'all', actWho: 'all', actFrom: '', actTo: '', actQuery: '', actProject: 'all', actPeriod: '' };
const presets = () => {
  const saved = readLayoutPreference('activity-presets', []);
  return Array.isArray(saved) ? saved.filter(row => typeof row.id === 'string' && typeof row.name === 'string' && row.filters).slice(0, 12) : [];
};
const applyPreset = filters =>
  Object.assign(
    S.ui,
    activityPresetFilters(filters, {
      today: calendarDate(new Date(), S.prefs.tz),
      projectIds: D()
        .projects.filter(canSee)
        .map(row => row.id),
      memberIds: D().members.map(row => row.id),
    }),
  );
IN.activityPresetName = el => {
  const m = S.ui.modals.at(-1);
  if (m?.type === 'activityPreset') m.name = el.value.slice(0, 60);
};
A.saveActivityPreset = () =>
  openModal({
    type: 'activityPreset',
    name: '',
    render: (m, H) =>
      `${H(T('Save activity filters', 'Сохранить фильтры активности'))}<div class="modal-b" translate="no"><label class="field">${T('Name', 'Название')}<input class="input" data-in="activityPresetName" maxlength="60" value="${esc(m.name)}"></label><p class="hint">${T('Personal preset for this workspace on this device. Relative periods stay relative.', 'Личная подборка для этого пространства на устройстве. Относительный период будет сдвигаться вместе с датой.')}</p></div><div class="modal-f"><button class="btn btn-secondary" data-a="closeModal">${T('Cancel', 'Отмена')}</button><button class="btn btn-primary" data-a="confirmActivityPreset">${T('Save', 'Сохранить')}</button></div>`,
  });
A.confirmActivityPreset = () => {
  const m = S.ui.modals.at(-1);
  if (m?.type !== 'activityPreset' || !m.name.trim()) return;
  const rows = presets();
  const filters = Object.fromEntries(Object.keys(activityDefaults).map(key => [key, String(S.ui[key] || '')]));
  if (filters.actPeriod) {
    filters.actFrom = '';
    filters.actTo = '';
  }
  writeLayoutPreference('activity-presets', [{ id: crypto.randomUUID(), name: m.name.trim(), filters }, ...rows].slice(0, 12));
  closeModal();
  render();
};
A.applyActivityPreset = el => {
  const preset = presets().find(row => row.id === el.dataset.id);
  if (preset) {
    applyPreset(preset.filters);
    render();
  }
};
A.deleteActivityPreset = el => {
  writeLayoutPreference(
    'activity-presets',
    presets().filter(row => row.id !== el.dataset.id),
  );
  render();
};
A.resetActivityFilters = () => {
  resetCollectionView(collectionView('activity', activityDefaults));
  render();
};

A.viewAccessEvents = async () => {
  const { publicLinksRequest, getSessionGeneration } = await import('../core/api.js');
  const generation = getSessionGeneration();
  const modal = {
    type: 'accessEvents',
    render: (_m, H) => {
      const kinds = {
        member: T('Member', 'Участник'),
        project: T('Project', 'Проект'),
        bookmark: T('Bookmark', 'Закладка'),
        task: T('Task', 'Задача'),
        file: T('File', 'Файл'),
        note: T('Note', 'Заметка'),
        'file-folder': T('File folder', 'Папка файлов'),
        'note-folder': T('Note folder', 'Папка заметок'),
      };
      if (generation !== getSessionGeneration()) return H(T('Workspace changed', 'Пространство изменилось'));
      const objects = {
        member: D().members,
        project: D().projects,
        bookmark: D().links,
        task: D().tasks,
        file: D().files,
        note: D().knowledgeNotes,
        'note-folder': D().knowledgeFolders,
        'file-folder': D().projects.flatMap(p => p.fileFolders || []),
      };
      const links = (modal.events || [])
        .map(e => {
          const actor = D().members.find(row => row.id === e.actorId)?.name || e.actorId;
          const object = objects[e.kind]?.find(row => row.id === e.targetId);
          const label = {
            issued: T('Granted public access', 'Выдан публичный доступ'),
            revoked: T('Revoked public access', 'Отозван публичный доступ'),
            role: T('Changed role', 'Изменена роль'),
            trashed: T('Moved to trash', 'В корзину'),
            restored: T('Restored', 'Восстановлено'),
          }[e.event];
          return `<li><strong>${esc(actor)}</strong> · ${label || ''}${e.event === 'role' ? ' · ' + esc(e.from) + ' → ' + esc(e.to) : ''}<br>${kinds[e.kind] || ''} · ${esc(object?.title || object?.name || e.targetId)} · ${esc(fmtTimestamp(e.at))}</li>`;
        })
        .join('');
      return `${H(T('Access and recovery history', 'История доступа и восстановления'))}<div class="modal-b" translate="no">${modal.error ? T('Could not load history. Reopen to retry.', 'Не удалось загрузить историю. Откройте её повторно.') : modal.events ? (links ? `<ul>${links}</ul>` : T('No changes recorded yet.', 'Изменений пока нет.')) : T('Loading…', 'Загрузка…')}</div>`;
    },
  };
  openModal(modal);
  try {
    modal.events = (await publicLinksRequest('/events')).events;
  } catch {
    modal.error = true;
  }
  if (generation === getSessionGeneration() && S.ui.modals.includes(modal)) render();
};
export function pageActivity() {
  const viewState = collectionView('activity', activityDefaults);
  if (S.ui.actPeriod) applyPreset(S.ui);
  const f = S.ui.actFilter || 'all';
  const who = S.ui.actWho || 'all';
  const tasks = new Map((D().tasks || []).map(t => [t.id, t]));
  const available = D().activity.filter(a => {
    const id = a.project || tasks.get(a.task)?.project;
    return !id || canSee(proj(id));
  });
  const query = S.ui.actQuery || '',
    project = S.ui.actProject || 'all';
  let as = available;
  if (f !== 'all')
    as = as.filter(a =>
      f === 'comments'
        ? a.verb.includes('comment')
        : f === 'status'
          ? /moved|completed|reopened/.test(a.verb)
          : f === 'projects'
            ? a.verb.includes('project')
            : true,
    );
  if (who !== 'all') as = as.filter(a => a.by === who);
  const from = S.ui.actFrom || '',
    to = S.ui.actTo || '';
  const invalidRange = !activityRangeValid(from, to);
  const dateError = invalidRange ? 'aria-invalid="true" aria-describedby="activity-date-error"' : '';
  as = as.filter(activityMatcher(D(), { query, project, from, to, zone: S.prefs.tz })).sort((a, b) => Number(new Date(b.at)) - Number(new Date(a.at)));
  const key = JSON.stringify(['activity', D().ws.id || D().ws.url, D().me, f, who, from, to, query, project]);
  const page = listWindow(as, collectionPage(viewState, key), 50);
  saveCollectionView(viewState, page.page);
  const b = {};
  page.items.forEach(a => (b[dayBucket(a.at)] ||= []).push(a));
  return `<div class="page activity-page layout-reading">
    <div class="ph"><div><h1>Activity</h1><p>Everything that's changed across the workspace.</p></div>${S.ui.currentUser?.role === 'admin' ? `<button class="btn btn-secondary" data-a="viewAccessEvents" translate="no">${T('Access and recovery history', 'История доступа и восстановления')}</button>` : ''}</div>
    <div class="activity-filters"><div class="activity-type-wide">${segmentedControl({
      label: 'Activity filters',
      key: 'actFilter',
      value: f,
      items: [
        ['all', 'All'],
        ['status', 'Status changes'],
        ['comments', 'Comments'],
        ['projects', 'Projects'],
      ],
    })}</div><label class="activity-type-narrow"><span class="sr">${T('Event type', 'Тип событий')}</span><select class="select" data-in="actType" aria-label="${T('Event type', 'Тип событий')}">${[
      ['all', 'All'],
      ['status', 'Status changes'],
      ['comments', 'Comments'],
      ['projects', 'Projects'],
    ]
      .map(([value, name]) => `<option value="${value}" ${f === value ? 'selected' : ''}>${name}</option>`)
      .join('')}</select></label>
    <input class="input" data-in="actQuery" aria-label="${T('Search activity', 'Поиск по активности')}" placeholder="${T('Object or project', 'Объект или проект')}" value="${esc(query)}"><label class="activity-project"><span class="sr">${T('Project', 'Проект')}</span><select class="select" data-in="actProject" aria-label="${T('Project', 'Проект')}"><option value="all">${T('All projects', 'Все проекты')}</option>${D()
      .projects.filter(canSee)
      .map(p => `<option value="${esc(p.id)}" ${project === p.id ? 'selected' : ''} translate="no">${esc(p.name)}</option>`)
      .join(
        '',
      )}</select></label><label class="activity-person"><span class="sr">${T('Person', 'Участник')}</span><select class="select" data-in="actWho" aria-label="Filter by person"><option value="all">Everyone</option>${D()
      .members.map(m => `<option value="${m.id}" ${who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`)
      .join(
        '',
      )}</select></label></div><div class="activity-context-bar"><details class="activity-date-options" ${disclosureAttributes('activity-period')}><summary>${T('Period', 'Период')}${from || to ? ' · ' + esc(from || '…') + ' → ' + esc(to || '…') : ''}</summary><div class="activity-date-fields"><div class="activity-date-presets"><button class="btn btn-secondary btn-sm" id="activity-period-today" data-a="activityPeriod" data-days="1">${T('Today', 'Сегодня')}</button><button class="btn btn-secondary btn-sm" id="activity-period-week" data-a="activityPeriod" data-days="7">${T('Last 7 days', 'Последние 7 дней')}</button></div><label class="field"><span>From date</span><input id="activity-from" type="date" class="input" data-in="actFrom" ${dateError} value="${esc(from)}" max="${esc(to)}"></label><label class="field"><span>To date</span><input id="activity-to" type="date" class="input" data-in="actTo" ${dateError} value="${esc(to)}" min="${esc(from)}"></label><button class="btn btn-ghost btn-sm" data-a="resetActivityDates">Clear dates</button></div></details>${f !== 'all' || who !== 'all' || from || to || query || project !== 'all' ? '<button class="btn btn-ghost btn-sm" data-a="resetActivityFilters">Reset filters</button>' : ''}${invalidRange ? '' : `<p class="hint" role="status"><span>Results</span>: ${page.total}</p>`}
    <details class="ui-menu" data-anchor-end ${disclosureAttributes('activity:presets')}><summary class="btn btn-secondary" translate="no">${T('Saved filters', '\u041c\u043e\u0438 \u0444\u0438\u043b\u044c\u0442\u0440\u044b')} · ${presets().length}</summary><div translate="no"><button class="btn btn-ghost" data-a="saveActivityPreset">${T('Save current filters', '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0435 \u0444\u0438\u043b\u044c\u0442\u0440\u044b')}</button>${presets()
      .map(
        row =>
          `<div class="row"><button class="btn btn-ghost grow" data-a="applyActivityPreset" data-id="${esc(row.id)}">${esc(row.name)}</button><button class="btn btn-ghost btn-sm" data-a="deleteActivityPreset" data-id="${esc(row.id)}" aria-label="${T('Remove preset', '\u0423\u0431\u0440\u0430\u0442\u044c \u043f\u043e\u0434\u0431\u043e\u0440\u043a\u0443')}: ${esc(row.name)}">×</button></div>`,
      )
      .join('')}</div></details>${activityGroupingControl('activity-grouping', true)}</div>
    ${
      invalidRange
        ? `<p id="activity-date-error" class="alert warn" role="alert" translate="no">${T('The start date must be on or before the end date. Correct the dates or clear the period.', 'Начальная дата должна быть не позже конечной. Исправьте даты или очистите период.')}</p>`
        : as.length
          ? Object.entries(b)
              .map(([k, list]) => `<div class="day-h">${k}</div><div class="feed lined">${activityFeed(list, { proj: true })}</div>`)
              .join('')
          : available.length && (f !== 'all' || who !== 'all' || from || to || query || project !== 'all')
            ? empty(
                'search',
                'No matching activity.',
                'Change the filters or clear them to see more events.',
                '<button class="btn btn-secondary" data-a="resetActivityFilters">Clear filters</button>',
              )
            : empty('activity', 'No activity yet', 'Changes to tasks and projects will appear here.')
    }${paginationHtml(page, key)}
  </div>`;
}
