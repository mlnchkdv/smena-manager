const LEGACY_ZONES = {
  '(GMT-08:00) Pacific Time': 'America/Los_Angeles',
  '(GMT-05:00) Eastern Time': 'America/New_York',
  '(GMT+00:00) London': 'Europe/London',
  '(GMT+01:00) Berlin': 'Europe/Berlin',
  '(GMT+04:00) Saratov': 'Europe/Saratov',
  '(GMT+08:00) Singapore': 'Asia/Singapore',
};

export function resolveTimeZone(value = 'Europe/Saratov') {
  const zone = LEGACY_ZONES[value] || value;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return zone;
  } catch {
    return 'Europe/Saratov';
  }
}

export function calendarDate(value = new Date(), zone = 'Europe/Saratov') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: resolveTimeZone(zone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatTimestamp(value, { locale = 'ru-RU', timeZone = 'Europe/Saratov', timeFormat = '24', timeOnly = false } = {}) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    ...(timeOnly ? {} : { dateStyle: 'medium' }),
    timeStyle: 'short',
    timeZone: resolveTimeZone(timeZone),
    hour12: timeFormat === '12',
  }).format(date);
}

export function nextRecurrenceDate(date, recurrence) {
  const [year, month, day] = String(date).split('-').map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  if (recurrence === 'Monthly') {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    current.setUTCDate(1);
    current.setUTCMonth(month);
    current.setUTCDate(Math.min(day, lastDay));
  } else current.setUTCDate(current.getUTCDate() + ({ Daily: 1, Weekly: 7, 'Every 2 weeks': 14 }[recurrence] || 7));
  return current.toISOString().slice(0, 10);
}
