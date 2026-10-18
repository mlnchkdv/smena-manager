import { addD, sod } from './utils.js';
import { S } from './store.js';

export function startOfWeek(date) {
  const day = sod(date);
  return addD(day, -((day.getDay() - S.prefs.weekStart + 7) % 7));
}
