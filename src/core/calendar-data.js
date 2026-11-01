import { D, S, visibleProjects, canSee } from './store.js';
import { calendarDayItems } from '../shared/calendar-items.js';
import { matchF, viewOf } from '../shell/view-engine.js';
export function calendarItemsForView(tasks, date, opt = {}) {
  const projectFilters = viewOf(opt.key || 'cal').filters.filter(filter => filter.f === 'project');
  const projects = visibleProjects()
    .filter(canSee)
    .filter(p => projectFilters.every(filter => matchF({ project: p.id }, filter)));
  return calendarDayItems(tasks, opt.events ? D().events : [], date, opt.project, { projects, layers: S.prefs.calendarLayers ?? 3 });
}
