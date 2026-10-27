/* ---------- NOTIFICATIONS ---------- */
import { ago, dayBucket, esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S, myNotifications, proj, task } from '../core/store.js';
import { empty } from '../ui/helpers.js';
import { notifIcon, notifText, notifSnippet } from './inbox.js';
import { notificationReadButton } from '../ui/notification-controls.js';
import { segmentedControl } from '../ui/segmented-control.js';

export function pageNotifications() {
  const f = S.ui.notifFilter;
  let ns = myNotifications()
    .slice()
    .sort((a, b) => b.at - a.at);
  const unread = ns.filter(n => !n.read).length;
  const read = ns.length - unread;
  if (f === 'unread') ns = ns.filter(n => !n.read);
  const buckets = {};
  ns.forEach(n => (buckets[dayBucket(n.at)] ||= []).push(n));
  return `<div class="page notifications-page" style="max-width:820px">
    <div class="ph"><div><h1 class="row" style="gap:10px">Notifications ${unread ? `<span class="badge accent">${unread} unread</span>` : ''}</h1><p>Updates on tasks and projects you follow.</p></div>
      <div class="acts">${segmentedControl({
        label: 'Notification filter',
        key: 'notifFilter',
        value: f,
        items: [
          ['all', 'All'],
          ['unread', 'Unread'],
        ],
      })}
      <details class="ui-menu notification-actions"><summary class="ibtn" aria-label="Notification actions" title="Notification actions">${ic('ellipsis', 16)}</summary><div><button class="btn btn-ghost" data-a="markAllRead" ${unread ? '' : 'disabled'}>${ic('check-check', 14)}Mark all as read</button>
      <button class="btn btn-ghost" data-a="clearReadNotifications" ${read ? '' : 'disabled'}>${ic('trash-2', 14)}Clear read</button></div></details>
      <button class="ibtn" data-a="go" data-r="settings" data-sec="notif-mentions" data-tip="Notification preferences" aria-label="Notification preferences">${ic('settings-2', 16)}</button></div></div>
    ${
      ns.length
        ? Object.entries(buckets)
            .map(
              ([b, list]) =>
                `<div class="day-h">${b}</div><div class="panel" style="overflow:hidden">${list
                  .map(n => {
                    const t = n.task ? task(n.task) : null;
                    const p = n.project ? proj(n.project) : t ? proj(t.project) : null;
                    const contextId = `notification-${esc(n.id)}`;
                    return `<div class="nrow notification-item ${n.read ? '' : 'unread'}"><button type="button" class="notification-open" data-a="openNotif" data-id="${esc(n.id)}">
        ${notifIcon(n)}<span class="grow notification-copy"><span class="notification-title" id="${contextId}">${notifText(n)}</span><span class="notification-snippet muted trunc" translate="no">${notifSnippet(n)}</span><span class="notification-meta faint">${p ? `<span translate="no">${esc(p.name)}</span> · ` : ''}${ago(n.at)}</span></span>
        ${n.read ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:var(--accent);margin-top:8px" aria-label="Unread"></span>'}
        </button>${notificationReadButton(n, contextId)}</div>`;
                  })
                  .join('')}</div>`,
            )
            .join('')
        : `<div class="panel">${empty('bell-off', "You're all caught up.", "No unread notifications. We'll let you know when something needs you.", `<button class="btn btn-secondary btn-sm" data-a="set" data-k="notifFilter" data-v="all">Show all</button>`)}</div>`
    }
  </div>`;
}
