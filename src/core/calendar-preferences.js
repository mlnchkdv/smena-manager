import { S } from './store.js';
import { readLayoutPreference, writeLayoutPreference } from './view-layout-preferences.js';

const valid = mode => ['month', 'week', 'agenda'].includes(mode);
const layoutKey = () => (innerWidth <= 640 ? 'calendarMobileMode' : 'calendarWideMode');
export function calendarMode() {
  const fallback = innerWidth <= 640 ? 'agenda' : 'month';
  const saved = readLayoutPreference(layoutKey(), fallback);
  return (S.ui.calMode = valid(saved) ? saved : fallback);
}
export function saveCalendarMode(mode) {
  if (valid(mode)) writeLayoutPreference(layoutKey(), mode);
}
