/* =====================================================================
   QUIRE — core: utils, icons, seed data, store, render loop, events
   ===================================================================== */
// Web fonts load without blocking first paint (the link starts as media=print).
import { calendarDate, resolveTimeZone } from '../shared/calendar-time.js';

document.querySelectorAll('link[data-font]').forEach(l => {
  l.media = 'all';
});
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const uid = (p = 'x') => p + (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

/* ---------- dates ---------- */
export const DAY = 864e5;
export const sod = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const TODAY = sod(new Date());
let calendarZone = 'Europe/Saratov';
export function updateToday(zone = calendarZone, now = new Date()) {
  calendarZone = resolveTimeZone(zone);
  const [year, month, day] = calendarDate(now, calendarZone).split('-').map(Number);
  TODAY.setTime(new Date(year, month - 1, day).getTime());
}
export const iso = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parse = s => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addD = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const dOff = n => iso(addD(TODAY, n));
export const diffD = (a, b) => Math.round((sod(a) - sod(b)) / DAY);
const DATE_WORDS = {
  en: {
    mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monGen: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    wdLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
  ru: {
    mon: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    monLong: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    monGen: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    wd: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
    wdLong: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  },
};
export const MON = [...DATE_WORDS.en.mon];
export const MONL = [...DATE_WORDS.en.monLong];
export const WD = [...DATE_WORDS.en.wd];
export const WDL = [...DATE_WORDS.en.wdLong];
let dateLocale = 'en-US';
/* Set from preferences on every render (core/theme.js), so utils never depends on the store. */
export let dateFormat = 'MMM d';
export function setDateFormat(f) {
  dateFormat = f || 'MMM d';
}
export function setDateLocale(locale) {
  dateLocale = locale || 'en-US';
  const words = dateLocale === 'ru-RU' ? DATE_WORDS.ru : DATE_WORDS.en;
  MON.splice(0, MON.length, ...words.mon);
  MONL.splice(0, MONL.length, ...words.monLong);
  WD.splice(0, WD.length, ...words.wd);
  WDL.splice(0, WDL.length, ...words.wdLong);
}
export function fmtFullDate(value) {
  const d = typeof value === 'string' ? parse(value) : value;
  if (!d) return '';
  if (dateLocale === 'ru-RU') return `${WDL[d.getDay()]}, ${d.getDate()} ${DATE_WORDS.ru.monGen[d.getMonth()]}`;
  return `${WDL[d.getDay()]}, ${MONL[d.getMonth()]} ${d.getDate()}`;
}
export function fmtDate(s, long) {
  const d = typeof s === 'string' ? parse(s) : s;
  if (!d) return '';
  const fmt = dateFormat;
  if (fmt === 'd/M') return `${d.getDate()}/${d.getMonth() + 1}${long ? '/' + d.getFullYear() : ''}`;
  if (fmt === 'M/d') return `${d.getMonth() + 1}/${d.getDate()}${long ? '/' + d.getFullYear() : ''}`;
  if (fmt === 'yyyy-MM-dd') return iso(d);
  if (dateLocale === 'ru-RU') {
    const year = long || d.getFullYear() !== TODAY.getFullYear() ? ` ${d.getFullYear()} г.` : '';
    return `${d.getDate()} ${DATE_WORDS.ru.monGen[d.getMonth()]}${year}`;
  }
  return `${MON[d.getMonth()]} ${d.getDate()}${long || d.getFullYear() !== TODAY.getFullYear() ? ', ' + d.getFullYear() : ''}`;
}
export function relDate(s) {
  if (!s) return '';
  const n = diffD(parse(s), TODAY);
  if (n === 0) return dateLocale === 'ru-RU' ? 'Сегодня' : 'Today';
  if (n === 1) return dateLocale === 'ru-RU' ? 'Завтра' : 'Tomorrow';
  if (n === -1) return dateLocale === 'ru-RU' ? 'Вчера' : 'Yesterday';
  if (n > 1 && n < 7) return WD[parse(s).getDay()];
  return fmtDate(s);
}
export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return dateLocale === 'ru-RU' ? 'только что' : 'just now';
  if (m < 60) return dateLocale === 'ru-RU' ? m + ' мин назад' : m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return dateLocale === 'ru-RU' ? h + ' ч назад' : h + 'h ago';
  const d = Math.round(h / 24);
  if (d < 7) return dateLocale === 'ru-RU' ? d + ' дн. назад' : d + 'd ago';
  return fmtDate(iso(new Date(ts)));
}
export const minsAgo = m => Date.now() - m * 6e4;
export function dayBucket(ts) {
  const n = diffD(parse(calendarDate(new Date(ts), calendarZone)), TODAY);
  if (n === 0) return dateLocale === 'ru-RU' ? 'Сегодня' : 'Today';
  if (n === -1) return dateLocale === 'ru-RU' ? 'Вчера' : 'Yesterday';
  if (n > -7) return dateLocale === 'ru-RU' ? 'На этой неделе' : 'This week';
  return dateLocale === 'ru-RU' ? 'Ранее' : 'Earlier';
}
