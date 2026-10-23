import { getSessionGeneration, savePersonalSettings } from './api.js';
import { createDraftJournal } from './offline-drafts.js';
import { personalPreferenceData } from '../shared/personal-settings.js';

const changedFields = (before, after) => Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value));
const browserNotify = detail => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('smena:personal-save-status', { detail }));
};

export function createPersonalPreferenceSync(options = {}) {
  const write = options.write || savePersonalSettings;
  const createJournal = options.createJournal || createDraftJournal;
  const notify = options.notify || browserNotify;
  const schedule = options.schedule || setTimeout;
  const cancel = options.cancel || clearTimeout;
  const session = options.session || getSessionGeneration;
  let owner;
  let generation = 0;
  let sessionAtConfigure;
  let confirmed = {};
  let desired = {};
  let lastInput = {};
  let journal;
  let active;
  let retryTimer;
  let retryDelay = 1000;
  let status = 'saved';
  const emit = (next, error) => {
    if (status === next && !error) return;
    status = next;
    notify({ status: next, error, owner });
  };
  const current = run => run === generation && session() === sessionAtConfigure;

  function flush() {
    if (active) return active;
    if (!owner || session() !== sessionAtConfigure) return Promise.resolve();
    if (retryTimer) cancel(retryTimer);
    retryTimer = null;
    const run = generation;
    const runJournal = journal;
    // Deferral assigns active before even a synchronous test writer finishes.
    active = Promise.resolve()
      .then(async () => {
        while (current(run)) {
          const patch = changedFields(confirmed, desired);
          if (!Object.keys(patch).length) {
            try {
              await runJournal.acknowledge(desired);
            } catch (error) {
              if (current(run)) notify({ status: 'recovery_unavailable', error, owner });
            }
            if (current(run)) emit('saved');
            return;
          }
          const sent = { ...desired };
          if (!['offline', 'unavailable'].includes(status)) emit('syncing');
          try {
            await runJournal.save({ base: confirmed, local: desired });
          } catch (error) {
            if (current(run)) notify({ status: 'recovery_unavailable', error, owner });
          }
          if (!current(run)) return;
          try {
            await write({ preferences: patch });
            if (!current(run)) return;
            confirmed = { ...confirmed, ...patch };
            retryDelay = 1000;
            try {
              await runJournal.acknowledge(sent);
            } catch (error) {
              if (current(run)) notify({ status: 'recovery_unavailable', error, owner });
            }
          } catch (error) {
            if (!current(run) || error.staleSession) return;
            const retryable = !error.status || error.status === 429 || error.status >= 500;
            emit(!error.status ? 'offline' : retryable ? 'unavailable' : error.status === 401 ? 'unauthorized' : 'invalid', error);
            if (retryable) {
              retryTimer = schedule(() => {
                retryTimer = null;
                if (current(run)) void flush();
              }, retryDelay);
              retryDelay = Math.min(retryDelay * 2, 60000);
            }
            return;
          }
        }
      })
      .finally(() => {
        if (run === generation) active = null;
      });
    return active;
  }

  return {
    async configure(id, preferences, context = {}) {
      generation += 1;
      const run = generation;
      if (retryTimer) cancel(retryTimer);
      retryTimer = active = null;
      retryDelay = 1000;
      owner = id;
      sessionAtConfigure = session();
      confirmed = personalPreferenceData(preferences);
      desired = { ...confirmed };
      lastInput = { ...confirmed };
      journal = createJournal({ ...context, owner: id, scope: 'preferences' });
      try {
        const draft = await journal.read();
        if (!current(run)) return null;
        if (draft?.base && draft.local) desired = { ...confirmed, ...changedFields(personalPreferenceData(draft.base), personalPreferenceData(draft.local)) };
        if (draft && !Object.keys(changedFields(confirmed, desired)).length) await journal.acknowledge(draft.local);
      } catch (error) {
        if (current(run)) notify({ status: 'recovery_unavailable', error, owner });
      }
      if (!current(run)) return null;
      lastInput = { ...desired };
      void flush();
      return { ...desired };
    },
    async queue(id, preferences) {
      if (!id || id !== owner || session() !== sessionAtConfigure) return;
      const input = personalPreferenceData(preferences);
      const delta = changedFields(lastInput, input);
      lastInput = input;
      if (!Object.keys(delta).length) return active;
      desired = { ...desired, ...delta };
      const run = generation;
      try {
        await journal.save({ base: confirmed, local: desired });
      } catch (error) {
        if (current(run)) notify({ status: 'recovery_unavailable', error, owner });
      }
      if (current(run)) return flush();
    },
    retry: flush,
    state: () => ({ owner, status, pending: Object.keys(changedFields(confirmed, desired)).length > 0 }),
  };
}

const sync = createPersonalPreferenceSync();
export const configurePersonalPreferences = (...args) => sync.configure(...args);
export const queuePersonalPreferences = (...args) => sync.queue(...args);
export const retryPersonalPreferences = () => sync.retry();
export const personalPreferenceSyncState = () => sync.state();
