import { S, me, myNotification, myNotifications, save } from '../core/store.js';
import { savePersonalSettings, clearReadNotifications } from '../core/api.js';
import { applyExternalCoreSnapshot } from '../core/bootstrap.js';
import { go, render } from '../shell/render.js';
import { toast } from '../ui/toast.js';

export async function persistPersonalChange(payload) {
  const base = structuredClone(S.data);
  const owner = S.ui.currentUser?.id;
  try {
    const result = await savePersonalSettings(payload);
    if (owner !== S.ui.currentUser?.id) return false;
    applyExternalCoreSnapshot(result.data, base);
    if (payload.profile) {
      Object.assign(S.ui.currentUser, { name: me().name, title: me().title });
      S.prefs.name = me().name;
      S.prefs.title = me().title;
    }
    save();
    render();
    return true;
  } catch (error) {
    if (error.staleSession || owner !== S.ui.currentUser?.id) return false;
    toast(error.message || 'Personal settings could not be synced. Keep this tab open and try again.', { kind: 'err', ms: 8000 });
    return false;
  }
}

export function registerNotificationActions(A) {
  A.selNotif = el => {
    const n = myNotification(el.dataset.id);
    if (!n) return;
    n.read = true;
    S.ui.inboxSel = n.id;
    void persistPersonalChange({ readState: { ids: [n.id], read: true } });
    render();
  };
  A.toggleRead = el => {
    const n = myNotification(el.dataset.id);
    if (!n) return;
    n.read = !n.read;
    void persistPersonalChange({ readState: { ids: [n.id], read: n.read } });
    render();
  };
  A.markAllRead = () => {
    const notifications = myNotifications();
    const count = notifications.filter(item => !item.read).length;
    notifications.forEach(item => {
      item.read = true;
    });
    S.ui.inboxSel = null;
    void persistPersonalChange({ readState: { ids: notifications.map(item => item.id), read: true } });
    render();
    if (count) toast("You're all caught up.");
  };
  A.clearReadNotifications = async () => {
    try {
      const base = structuredClone(S.data);
      const result = await clearReadNotifications(S.ui.workspaceRevision);
      applyExternalCoreSnapshot(result.data, base);
      render();
      toast(result.removed ? 'Read notifications cleared' : 'No read notifications to clear', { ms: 1800 });
    } catch (error) {
      if (!error.staleSession) toast(error.message || 'Unable to clear read notifications.', { kind: 'err', ms: 5000 });
    }
  };
  A.toggleUnreadOnly = () => {
    S.ui.inboxUnread = !S.ui.inboxUnread;
    S.ui.inboxSel = null;
    render();
  };
  A.openNotif = el => {
    const n = myNotification(el.dataset.id);
    if (!n) return;
    n.read = true;
    void persistPersonalChange({ readState: { ids: [n.id], read: true } });
    if (n.task) A.openTask({ dataset: { id: n.task } });
    else if (n.project) go('project', { id: n.project, tab: 'overview' });
    else if (n.type === 'security' || n.type === 'system') A.go({ dataset: { r: 'settings', sec: n.type === 'system' ? 'notif-push' : 'security' } });
  };
}
