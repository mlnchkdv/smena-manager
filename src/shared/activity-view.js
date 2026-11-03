import { searchTerms } from './search-query.js';
import { calendarDate } from './calendar-time.js';
export const activityRangeValid = (from, to) => !from || !to || from <= to;
export function activityMatcher(data, { query = '', project = 'all', from = '', to = '', zone } = {}) {
  const terms = searchTerms(query),
    tasks = new Map((data.tasks || []).map(t => [t.id, t])),
    projects = new Map((data.projects || []).map(p => [p.id, p]));
  return event => {
    if (!activityRangeValid(from, to)) return false;
    const task = tasks.get(event.task),
      id = event.project || task?.project;
    if (project !== 'all' && id !== project) return false;
    const date = new Date(event.at);
    if (!Number.isFinite(date.getTime())) return false;
    if (from || to) {
      const day = calendarDate(date, zone);
      if ((from && day < from) || (to && day > to)) return false;
    }
    const text = [event.verb, event.extra, task?.title, projects.get(id)?.name].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  };
}
