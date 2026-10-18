import { DEFAULT_NOTIFICATION_PREFERENCES, notificationRecipient } from './notification-model.js';
import { resolveTimeZone } from './calendar-time.js';

const PREFERENCE_TYPES = Object.freeze({
  theme: 'string',
  accent: 'string',
  side: 'string',
  density: 'string',
  weekStart: 'number',
  dateFmt: 'string',
  timeFmt: 'string',
  lang: 'string',
  tz: 'string',
  motion: 'string',
  home: 'string',
  openTasks: 'string',
});

export const MAX_READ_STATE_IDS = 500;

export async function persistReadStateBatches(ids, read, persist) {
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += MAX_READ_STATE_IDS) {
    if (!(await persist({ readState: { ids: unique.slice(start, start + MAX_READ_STATE_IDS), read } }))) return false;
  }
  return true;
}

export function personalPreferenceData(preferences) {
  return Object.fromEntries(Object.entries(preferences || {}).filter(([key, value]) => typeof value === PREFERENCE_TYPES[key]));
}

export function applyPersonalSettings(database, memberId, input) {
  const member = database.members?.find(item => item.id === memberId);
  if (!member) throw Object.assign(new Error('Member not found.'), { statusCode: 403, code: 'MEMBER_REQUIRED' });
  const invalid = () => {
    throw new TypeError('Invalid personal settings.');
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  if (input.preferences) {
    if (typeof input.preferences !== 'object' || Array.isArray(input.preferences)) invalid();
    for (const [key, value] of Object.entries(input.preferences)) {
      if (typeof value !== PREFERENCE_TYPES[key] || (typeof value === 'string' && value.length > 180)) invalid();
      if (key === 'theme' && !['light', 'dark', 'system'].includes(value)) invalid();
      if (key === 'timeFmt' && !['12', '24'].includes(value)) invalid();
      if (key === 'weekStart' && ![0, 1, 6].includes(value)) invalid();
      if (key === 'lang' && !['Русский', 'English (US)', 'English (UK)'].includes(value)) invalid();
    }
    database._userPrefs = { ...database._userPrefs, [memberId]: { ...database._userPrefs?.[memberId], ...input.preferences } };
    if (input.preferences.lang) member.locale = input.preferences.lang === 'Русский' ? 'ru' : 'en';
    if (input.preferences.tz) member.timeZone = resolveTimeZone(input.preferences.tz);
  }
  if (input.profile) {
    if (typeof input.profile !== 'object' || Array.isArray(input.profile)) invalid();
    for (const [key, value] of Object.entries(input.profile)) {
      if (!['name', 'title', 'c'].includes(key) || typeof value !== 'string' || value.length > 200) invalid();
      if (key === 'name' && !value.trim()) invalid();
      if (key === 'c' && !/^#[\da-f]{6}$/iu.test(value)) invalid();
      member[key] = value.trim();
    }
    member.profileEditedAt = new Date().toISOString();
  }
  if (input.notificationPreferences) {
    if (typeof input.notificationPreferences !== 'object' || Array.isArray(input.notificationPreferences)) invalid();
    for (const [key, value] of Object.entries(input.notificationPreferences)) {
      if (!Object.hasOwn(DEFAULT_NOTIFICATION_PREFERENCES, key) || typeof value !== 'boolean') invalid();
    }
    database.notifPrefs = { ...database.notifPrefs, [memberId]: { ...database.notifPrefs?.[memberId], ...input.notificationPreferences } };
  }
  if (input.readState) {
    const { ids, read } = input.readState;
    if (!Array.isArray(ids) || ids.length > MAX_READ_STATE_IDS || ids.some(id => typeof id !== 'string') || typeof read !== 'boolean') invalid();
    const requested = new Set(ids);
    for (const item of database.notifs || []) if (requested.has(item.id) && notificationRecipient(item, database) === memberId) item.read = read;
  }
  return database;
}
