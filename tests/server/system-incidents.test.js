import test from 'node:test';
import assert from 'node:assert/strict';
import { issueObservations, reconcileSystemIncidents, systemIncidentObservations, incidentStateLabel } from '../../src/shared/system-incidents.js';
import { reconcileWorkspaceNotifications } from '../../src/shared/notification-model.js';
import { inboxEventGroups } from '../../src/shared/inbox-groups.js';

const fixture = () => ({ members: [{ id: 'owner' }, { id: 'other' }], notifs: [] });
const admins = [{ id: 'owner' }];

test('incidents keep identity, chronology and read state; a later failure creates a new incident', () => {
  const data = fixture();
  assert.equal(reconcileSystemIncidents(data, issueObservations(['Automatic backup failed']), admins, 100).length, 1);
  data.notifs[0].read = true;
  reconcileSystemIncidents(data, issueObservations(['Automatic backup failed']), admins, 200);
  assert.equal(data.notifs.length, 1);
  assert.equal(data.notifs[0].at, 100);
  assert.equal(data.notifs[0].incident.lastAt, 200);
  const recovery = systemIncidentObservations({ backup: { backupId: 'verified' } }, data);
  reconcileSystemIncidents(data, recovery, admins, 300);
  assert.equal(data.notifs[0].read, true);
  assert.equal(data.notifs[0].incident.state, 'resolved');
  assert.equal(data.notifs[0].incident.resolvedAt, 300);
  reconcileSystemIncidents(data, issueObservations(['Automatic backup failed']), admins, 250);
  assert.equal(data.notifs.length, 1, 'late stale failure cannot reopen a recovery');
  reconcileSystemIncidents(data, issueObservations(['Automatic backup failed']), admins, 400);
  assert.equal(data.notifs.length, 2);
  assert.notEqual(data.notifs[0].incident.id, data.notifs[1].incident.id);
  assert.equal(data.notifs[0].read, false);
  data.notifs[0].read = true;
  assert.equal(inboxEventGroups(data.notifs).length, 2, 'new active event cannot hide inside old resolved history');
});

test('healthy configuration, empty/skipped/missing deliveries and unrelated success cannot resolve a delivery failure', () => {
  const data = fixture();
  data._notificationOutbox = [{ id: 'job', channels: { email: { status: 'pending', attempts: 1 } } }];
  reconcileSystemIncidents(data, systemIncidentObservations({ outbox: { failed: 1 } }, data), admins, 100);
  const observe = () =>
    reconcileSystemIncidents(data, systemIncidentObservations({ status: 'ok', backup: { backupId: 'copy' }, outbox: { failed: 0 } }, data), admins, 200);
  observe();
  assert.equal(data.notifs[0].incident.state, 'active');
  data._notificationOutbox[0].channels.email.status = 'skipped';
  observe();
  assert.equal(data.notifs[0].incident.state, 'active');
  data._notificationOutbox = [];
  observe();
  assert.equal(data.notifs[0].incident.state, 'active');
  data._notificationOutbox = [{ id: 'job', channels: { email: { status: 'sent', attempts: 2 } } }];
  observe();
  assert.equal(data.notifs[0].incident.state, 'resolved');
  assert.equal(data.notifs[0].incident.evidence, 'delivery_confirmed');
});

test('legacy and ambiguous digest events remain unconfirmed; clients cannot forge recovery metadata', () => {
  const data = fixture();
  data.notifs.push({ id: 'legacy', recipient: 'owner', type: 'system', by: null, snippet: 'Automatic backup failed', read: false });
  reconcileSystemIncidents(data, systemIncidentObservations({ backup: { backupId: 'copy' }, digest: { queued: 2, today: '2026-11-06' } }, data), admins, 100);
  assert.equal(data.notifs[0].incident, undefined);
  assert.equal(incidentStateLabel(data.notifs[0], 'ru'), 'Историческое · статус не подтверждён');
  reconcileSystemIncidents(data, issueObservations(['Notification delivery failed']), admins, 200);
  reconcileSystemIncidents(data, systemIncidentObservations({ digest: { queued: 2, today: '2026-11-06' } }, data), admins, 300);
  assert.equal(data.notifs[0].incident.state, 'active');
  const forged = structuredClone(data);
  forged.notifs[0].incident.state = 'resolved';
  forged.notifs[0].read = true;
  const saved = reconcileWorkspaceNotifications(data, forged, { actorMemberId: 'owner' }).notifs;
  assert.equal(saved[0].incident.state, 'active');
  assert.equal(saved[0].read, true);
  assert.equal(incidentStateLabel({ type: 'comment' }), '');
});

test('a concurrent failure invalidates an earlier recovery review and preparation never claims mail delivery', () => {
  const data = fixture();
  reconcileSystemIncidents(data, issueObservations(['Automatic backup failed', 'Email digest preparation failed']), admins, 100);
  const observations = systemIncidentObservations({ backup: { backupId: 'copy' }, digest: { queued: 0, today: '2026-11-06' } }, data, 150);
  reconcileSystemIncidents(data, issueObservations(['Automatic backup failed']), admins, 200);
  reconcileSystemIncidents(data, observations, admins, 300);
  assert.equal(data.notifs.find(n => n.incident.component === 'backup').incident.state, 'active');
  const digest = data.notifs.find(n => n.incident.component === 'digest').incident;
  assert.equal(digest.state, 'resolved');
  assert.equal(digest.evidence, 'digest_prepared');
  const sameRunFailure = systemIncidentObservations({ backup: { backupId: 'copy' } }, data, 199);
  reconcileSystemIncidents(data, sameRunFailure, admins, 400);
  assert.equal(data.notifs.find(n => n.incident.component === 'backup').incident.state, 'active');
});
