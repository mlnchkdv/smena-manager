import { savePersonalSettings } from './api.js';
import { personalPreferenceData } from '../shared/personal-settings.js';

let owner = '';
let confirmed = '';
let pending;
let active = false;
let generation = 0;

export function configurePersonalPreferences(id, preferences) {
  generation += 1;
  owner = id;
  confirmed = JSON.stringify(personalPreferenceData(preferences));
  pending = null;
  active = false;
}

export async function queuePersonalPreferences(id, preferences) {
  if (!id || id !== owner) return;
  const data = personalPreferenceData(preferences);
  if (!active && JSON.stringify(data) === confirmed) return;
  pending = data;
  if (active) return;
  active = true;
  const run = generation;
  try {
    while (pending && run === generation) {
      const sent = pending;
      pending = null;
      try {
        await savePersonalSettings({ preferences: sent });
        if (run !== generation) return;
        confirmed = JSON.stringify(sent);
      } catch (error) {
        if (run === generation) {
          pending ||= sent;
          window.dispatchEvent(new CustomEvent('smena:personal-save-error', { detail: { error } }));
        }
        return;
      }
    }
  } finally {
    if (run === generation) active = false;
  }
}
