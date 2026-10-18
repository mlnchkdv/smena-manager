import { S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { toast } from '../ui/toast.js';

let loading;
const load = () =>
  (loading ||= import('./notifications.js').catch(error => {
    loading = null;
    throw error;
  }));
const context = () => JSON.stringify([S.ui.currentUser?.id, getSessionGeneration()]);
const failed = () => toast('Unable to load this action. Reload the page and try again.', { kind: 'err', ms: 8000 });

export async function persistPersonalChange(payload) {
  const before = context();
  const input = structuredClone(payload);
  try {
    const module = await load();
    if (before !== context() || !S.ui.currentUser) return false;
    return module.persistPersonalChange(input);
  } catch {
    if (before === context()) failed();
    return false;
  }
}

export function registerNotificationActions(actions) {
  for (const name of ['selNotif', 'toggleRead', 'markAllRead', 'clearReadNotifications', 'toggleUnreadOnly', 'openNotif']) {
    actions[name] = async (...args) => {
      const before = context();
      try {
        const module = await load();
        if (before !== context() || !S.ui.currentUser) return;
        module.registerNotificationActions(actions);
        return actions[name](...args);
      } catch {
        if (before === context()) failed();
      }
    };
  }
}
