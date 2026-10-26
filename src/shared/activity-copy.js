const DATE_VERBS = new Set(['changed due date of', 'changed start date of', 'set a subtask due date on']);
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
function isoDate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match && Number(match[1]) >= 1000 && validDate(...match.slice(1).map(Number)) ? value : null;
}

/** Missing years stay missing. Ambiguous numeric dates and arbitrary legacy text stay verbatim. */
function legacyDate(value, locale) {
  const text = String(value || '').replace(/^to /u, '');
  const ru = /^(\d{1,2}) ([а-яё]+)(?: (\d{4})(?: г\.)?)?$/iu.exec(text);
  const en = /^([a-z]+) (\d{1,2})(?:, (\d{4}))?$/iu.exec(text);
  const month = ru
    ? RU_MONTHS.indexOf(ru[2].toLowerCase())
    : en
      ? EN_MONTHS.findIndex(name => [name.toLowerCase(), name.slice(0, 3).toLowerCase()].includes(en[1].toLowerCase()))
      : -1;
  const day = Number(ru?.[1] || en?.[2]);
  const year = ru?.[3] || en?.[3];
  const date = month >= 0 && validDate(Number(year || 2000), month + 1, day);
  return date
    ? new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: locale.startsWith('ru') ? 'long' : 'short',
        ...(year ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
      }).format(date)
    : null;
}

export function activityDateExtra(activity, locale = 'en-US', formatDate) {
  if (!DATE_VERBS.has(activity.verb)) return null;
  const ru = locale.startsWith('ru');
  const expected = activity.verb === 'changed start date of' ? 'start' : activity.verb === 'set a subtask due date on' ? 'subtaskDue' : 'due';
  const change = activity.change?.field === expected ? activity.change : null;
  if (change?.value === null || (!change && activity.extra === '(cleared)')) return ru ? '— дата удалена' : '— date cleared';
  const value = isoDate(change?.value) || isoDate(String(activity.extra || '').replace(/^to /u, ''));
  const formatted = value
    ? formatDate
      ? formatDate(value)
      : new Intl.DateTimeFormat(locale, { year: 'numeric', month: ru ? 'long' : 'short', day: 'numeric', timeZone: 'UTC' }).format(
          new Date(`${value}T00:00:00Z`),
        )
    : legacyDate(activity.extra, locale);
  return formatted ? `${ru ? 'на' : 'to'} ${formatted}` : String(activity.extra || '');
}

export function activityVerbForm(translated, self, locale = 'en-US') {
  return self && locale.startsWith('ru') ? String(translated).replace(/л\(а\)/gu, 'ли') : translated;
}

export function activityTransitionExtra(value, verb, locale = 'en-US') {
  if (verb !== 'moved' || !locale.startsWith('ru')) return null;
  const match = /^from (.+) to (.+)$/u.exec(String(value || ''));
  if (!match) return null;
  const statuses = { backlog: 'Бэклог', 'to do': 'К выполнению', 'in progress': 'В работе', review: 'На проверке', done: 'Готово' };
  const fromKey = match[1].toLowerCase(),
    toKey = match[2].toLowerCase();
  const from = Object.hasOwn(statuses, fromKey) ? statuses[fromKey] : null,
    to = Object.hasOwn(statuses, toKey) ? statuses[toKey] : null;
  return from && to ? `из «${from}» в «${to}»` : null;
}
