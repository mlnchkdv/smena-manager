import { activityGroups } from '../shared/activity-groups.js';
import { calendarDate } from '../shared/calendar-time.js';
import { actHtml } from '../components/task-list.js';
import { S, mem, task } from '../core/store.js';
import { esc, fmtTimestamp } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { IN } from '../actions/actions.js';
import { render } from '../shell/render.js';
import { readLayoutPreference, writeLayoutPreference } from '../core/view-layout-preferences.js';
import { disclosureAttributes } from './disclosure.js';
const copy = (en, ru) => (isRussian() ? ru : en);
IN.activityGrouping = el => {
  writeLayoutPreference('activityGrouping', el.checked);
  render();
};
export function activityGroupingControl(id, compact = false) {
  const label = copy('Group similar events', 'Группировать похожие события');
  return `<label class="activity-grouping" for="${id}" translate="no" title="${label}"><input id="${id}" type="checkbox" data-in="activityGrouping" aria-label="${label}" ${readLayoutPreference('activityGrouping', false) ? 'checked' : ''}><span${compact ? ' class="hide-m"' : ''}>${label}</span>${compact ? `<span class="only-m">${copy('Group similar', 'Группировать')}</span>` : ''}</label>`;
}
export function activityFeed(events, opt = {}) {
  return activityGroups(events, { enabled: readLayoutPreference('activityGrouping', false), day: event => calendarDate(new Date(event.at), S.prefs.tz) })
    .map(group => {
      if (group.events.length === 1) return actHtml(group.events[0], opt);
      const first = group.events[0],
        last = group.events.at(-1),
        person = mem(first.by)?.name || copy('Someone', 'Участник'),
        object = task(first.task)?.title || '';
      return `<details class="activity-event-group" ${disclosureAttributes('activity-group:' + JSON.stringify(group.events.map(e => e.id || [e.at, e.task, e.by, e.verb])))}><summary><strong translate="no">${esc(person)} · ${copy('Updates', 'Изменения')}: ${group.events.length}</strong><span translate="no">${esc(object)}</span><time translate="no">${fmtTimestamp(last.at)} — ${fmtTimestamp(first.at)}</time></summary><div class="feed lined">${group.events.map(event => actHtml(event, opt)).join('')}</div></details>`;
    })
    .join('');
}
