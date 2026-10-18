import { S, me, myNotification, myNotifications, save } from '../core/store.js';
import { getSessionGeneration, savePersonalSettings, clearReadNotifications } from '../core/api.js';
import { persistReadStateBatches } from '../shared/personal-settings.js';
import { applyExternalCoreSnapshot } from '../core/bootstrap.js';
import { go, render } from '../shell/render.js';
import { toast } from '../ui/toast.js';

let personalWriteQueue = Promise.resolve();
let queueSession;
const readEdits = new Map();
let readVersion = 0;

export function persistPersonalChange(payload) {
  const base = structuredClone(S.data);
  const owner = S.ui.currentUser?.id;
  const session = getSessionGeneration();
  if (queueSession !== session) {
    queueSession = session;
    personalWriteQueue = Promise.resolve();
  }
  const input = structuredClone(payload);
  const result = personalWriteQueue.then(() => {
    if (!owner || owner !== S.ui.currentUser?.id || session !== getSessionGeneration()) return false;
    return writePersonalChange(input, base, owner);
  });
  personalWriteQueue = result.catch(() => false);
  return result;
}

async function writePersonalChange(payload, base, owner) {
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

async function persistReadState(ids, read) {
  const owner = S.ui.currentUser?.id;
  const version = ++readVersion;
  const changed = ids
    .map(id => myNotification(id))
    .filter(Boolean)
    .map(item => ({ id: item.id, before: item.read }));
  for (const item of changed) {
    readEdits.set(JSON.stringify([owner, item.id]), version);
    myNotification(item.id).read = read;
  }
  render();
  const saved = await persistPersonalChange({ readState: { ids, read } });
  for (const item of changed) {
    const key = JSON.stringify([owner, item.id]);
    if (readEdits.get(key) !== version) continue;
    readEdits.delete(key);
    if (!saved && owner === S.ui.currentUser?.id && myNotification(item.id)) myNotification(item.id).read = item.before;
  }
  if (owner !== S.ui.currentUser?.id) return false;
  render();
  return saved;
}

export function registerNotificationActions(A) {
  A.selNotif = el => {
    const n = myNotification(el.dataset.id);
    if (!n) return;
    S.ui.inboxSel = n.id;
    void persistReadState([n.id], true);
  };
  A.toggleRead = el => {
    const n = myNotification(el.dataset.id);
    if (!n) return;
    void persistReadState([n.id], !n.read);
  };
  A.markAllRead = async () => {
    const owner = S.ui.currentUser?.id;
    if (!owner || S.ui.markingAllRead === owner) return;
    const ids = myNotifications()
      .filter(item => !item.read)
      .map(item => item.id);
    S.ui.markingAllRead = owner;
    S.ui.inboxSel = null;
    try {
      const saved = await persistReadStateBatches(ids, true, payload =>
        owner === S.ui.currentUser?.id ? persistReadState(payload.readState.ids, payload.readState.read) : false,
      );
      if (saved && owner === S.ui.currentUser?.id && ids.length) toast("You're all caught up.");
    } finally {
      if (S.ui.markingAllRead === owner) S.ui.markingAllRead = false;
      if (owner === S.ui.currentUser?.id) {
        render();
      }
    }
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
    void persistReadState([n.id], true);
    if (n.task) A.openTask({ dataset: { id: n.task } });
    else if (n.project) go('project', { id: n.project, tab: 'overview' });
    else if (n.type === 'security' || n.type === 'system') A.go({ dataset: { r: 'settings', sec: n.type === 'system' ? 'notif-push' : 'security' } });
  };
}
