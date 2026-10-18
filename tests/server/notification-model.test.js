import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addWorkspaceNotification,
  emailPreferenceForNotification,
  mentionNotificationTargets,
  migrateNotificationRecipients,
  mentionedMemberIds,
  mentionedTeamIds,
  mentionsWorkspace,
  notificationForMember,
  notificationPreferencesForMember,
  notificationsForMember,
  reconcileWorkspaceNotifications,
  setNotificationPreference,
  pushPreferenceForNotification,
} from '../../src/shared/notification-model.js';

const workspace = () => ({
  me: 'owner',
  members: [
    { id: 'owner', name: 'Owner User', role: 'Owner', team: 'product', status: 'active' },
    { id: 'editor', name: 'Editor User', role: 'Member', team: 'product', status: 'active' },
    { id: 'designer', name: 'Design User', role: 'Member', team: 'design', status: 'active' },
    { id: 'former', name: 'Former User', role: 'Member', team: 'product', status: 'deactivated' },
  ],
  teams: [
    { id: 'product', name: 'Продукт' },
    { id: 'design', name: 'Design' },
  ],
  notifs: [
    { id: 'owner-notification', recipient: 'owner', read: false },
    { id: 'editor-notification', recipient: 'editor', read: false },
  ],
});

test('workspace notifications are visible only to their recipient', () => {
  const data = workspace();

  assert.deepEqual(
    notificationsForMember(data, 'owner').map(notification => notification.id),
    ['owner-notification'],
  );
  assert.deepEqual(
    notificationsForMember(data, 'editor').map(notification => notification.id),
    ['editor-notification'],
  );
  assert.equal(notificationForMember(data, 'owner-notification', 'editor'), null);
});

test('legacy notifications are assigned to the stored current member', () => {
  const source = workspace();
  source.notifs = [{ id: 'legacy-notification', read: false }];

  const migrated = migrateNotificationRecipients(source);

  assert.equal(migrated.notifs[0].recipient, 'owner');
  assert.equal(source.notifs[0].recipient, undefined);
  assert.deepEqual(notificationsForMember(migrated, 'editor'), []);
});

test('new notifications require another valid workspace member as recipient', () => {
  const data = workspace();
  const created = addWorkspaceNotification(data, {
    id: 'new-notification',
    recipient: 'editor',
    by: 'owner',
    type: 'assign',
    text: 'assigned you',
    at: 123,
  });

  assert.equal(created?.recipient, 'editor');
  assert.equal(created?.read, false);
  assert.equal(data.notifs[0].id, 'new-notification');
  assert.equal(addWorkspaceNotification(data, { ...created, text: 'duplicate' }), created);
  assert.equal(data.notifs.filter(item => item.id === 'new-notification').length, 1);
  assert.equal(addWorkspaceNotification(data, { id: 'self', recipient: 'owner', by: 'owner' }), null);
  assert.equal(
    addWorkspaceNotification(data, {
      id: 'explicit-self-mention',
      recipient: 'owner',
      by: 'owner',
      type: 'mention',
      scope: 'direct',
    })?.id,
    'explicit-self-mention',
  );
  assert.equal(addWorkspaceNotification(data, { id: 'unknown', recipient: 'missing', by: 'owner' }), null);
});

test('mentions resolve full member names without partial matches', () => {
  const members = [
    { id: 'alex', name: 'Alex Alyoshin' },
    { id: 'polina', name: 'Polina Grischenko' },
  ];

  assert.deepEqual(mentionedMemberIds('Проверь, пожалуйста, @Alex Alyoshin. Затем @Polina Grischenko!', members), ['alex', 'polina']);
  assert.deepEqual(mentionedMemberIds('Это не упоминание @Alex', members), []);
});

test('team and workspace mentions resolve recipients with Cyrillic aliases', () => {
  const data = workspace();

  assert.deepEqual(mentionedTeamIds('Коллеги, @Продукт: проверьте задачу.', data.teams), ['product']);
  assert.equal(mentionsWorkspace('Важно для @пространство!'), true);
  assert.equal(mentionsWorkspace('Обычный текст для всех'), false);
  assert.deepEqual(mentionNotificationTargets('@Editor User, @Продукт и @все', data), [
    { recipient: 'editor', scope: 'direct' },
    { recipient: 'owner', scope: 'team', team: 'product' },
    { recipient: 'editor', scope: 'team', team: 'product' },
    { recipient: 'owner', scope: 'workspace' },
    { recipient: 'editor', scope: 'workspace' },
    { recipient: 'designer', scope: 'workspace' },
  ]);
});

test('notification preferences are migrated and applied per recipient', () => {
  const source = workspace();
  source.notifPrefs = { assign_self: false, mention_all: true };
  const migrated = migrateNotificationRecipients(source);

  assert.equal(notificationPreferencesForMember(migrated, 'owner').assign_self, false);
  assert.equal(notificationPreferencesForMember(migrated, 'editor').assign_self, true);
  assert.equal(
    addWorkspaceNotification(migrated, {
      id: 'disabled-assignment',
      recipient: 'owner',
      by: 'editor',
      type: 'assign',
    }),
    null,
  );

  assert.equal(setNotificationPreference(migrated, 'editor', 'mention_all', false), true);
  assert.equal(notificationPreferencesForMember(migrated, 'editor').mention_all, false);
  assert.equal(setNotificationPreference(migrated, 'editor', 'mention_team', false), true);
  assert.equal(
    addWorkspaceNotification(migrated, {
      id: 'disabled-team-mention',
      recipient: 'editor',
      by: 'owner',
      type: 'mention',
      scope: 'team',
    }),
    null,
  );
  assert.equal(setNotificationPreference(migrated, 'editor', 'mention_all', true), true);
  assert.ok(
    addWorkspaceNotification(migrated, {
      id: 'enabled-direct-mention',
      recipient: 'editor',
      by: 'owner',
      type: 'mention',
      scope: 'direct',
    }),
  );
  assert.equal(setNotificationPreference(migrated, 'editor', 'mention_ws', false), true);
  assert.equal(
    addWorkspaceNotification(migrated, {
      id: 'disabled-workspace-mention',
      recipient: 'editor',
      by: 'owner',
      type: 'mention',
      scope: 'workspace',
    }),
    null,
  );
  assert.equal(setNotificationPreference(migrated, 'editor', 'unknown_preference', false), false);
});

test('delivery channels map notification types to independent preferences', () => {
  assert.equal(pushPreferenceForNotification({ type: 'due' }), 'push_due');
  assert.equal(emailPreferenceForNotification({ type: 'due' }), 'email_due');
  assert.equal(emailPreferenceForNotification({ type: 'mention' }), 'email_mention');
  assert.equal(emailPreferenceForNotification({ type: 'update' }), 'email_update');
});

test('stable mention references resolve renamed and duplicate names without ambiguous legacy fanout', () => {
  const data = workspace();
  data.members[1].name = 'Renamed';
  data.members[2].name = 'Renamed';
  assert.deepEqual(mentionNotificationTargets('@Renamed test', data), []);
  assert.deepEqual(mentionNotificationTargets('@Old name test', data, [{ id: 'editor', kind: 'member', label: 'Old name' }]), [
    { recipient: 'editor', scope: 'direct' },
  ]);
  assert.deepEqual(mentionNotificationTargets('No mention', data, [{ id: 'editor', kind: 'member', label: 'Old name' }]), []);
  data.members[2].name = 'Old name';
  assert.deepEqual(mentionNotificationTargets('@Old name test', data, [{ id: 'editor', kind: 'member', label: 'Old name' }]), [
    { recipient: 'editor', scope: 'direct' },
  ]);
  data.teams[0].name = 'Renamed product';
  assert.deepEqual(
    mentionNotificationTargets('@Продукт test', data, [{ id: 'product', kind: 'group', label: 'Продукт' }]).map(target => target.recipient),
    ['owner', 'editor'],
  );
});

test('description mentions notify only newly added recipients and comments reach trusted task creator', () => {
  const current = workspace();
  current.tasks = [{ id: 't', title: 'Task', createdBy: 'designer', assignee: 'editor', desc: '<p>@Editor User</p>' }];
  current.comments = [];
  const candidate = structuredClone(current);
  candidate.tasks[0].desc = '<p>@Editor User @Owner User</p>';
  candidate.tasks[0].createdBy = 'owner';
  candidate.comments.push({ id: 'c', task: 't', text: 'Ready', by: 'editor', re: { '👍': ['owner', 'designer'] } });
  const result = reconcileWorkspaceNotifications(current, candidate, { actorMemberId: 'editor', now: 100 });
  assert.equal(result.tasks[0].createdBy, 'designer');
  assert.deepEqual(result.comments[0].re['👍'], []);
  assert.equal(result.notifs.filter(item => item.type === 'mention' && item.recipient === 'editor').length, 0);
  assert.equal(result.notifs.filter(item => item.type === 'mention' && item.recipient === 'owner').length, 1);
  assert.equal(result.notifs.filter(item => item.type === 'comment' && item.recipient === 'designer').length, 1);
});

test('server reconciliation rejects forged notifications and creates trusted task events', () => {
  const current = workspace();
  current.revision = 4;
  current.tasks = [{ id: 'task-1', title: 'Макет', assignee: 'editor', status: 'todo' }];
  current.comments = [];
  current.notifs = [
    { id: 'for-owner', recipient: 'owner', by: 'editor', type: 'mention', text: 'original', read: false },
    { id: 'for-editor', recipient: 'editor', by: 'owner', type: 'assign', text: 'assigned you', read: false },
  ];
  const candidate = structuredClone(current);
  candidate.tasks[0].status = 'review';
  candidate.tasks.push({ id: 'task-2', title: 'Новая задача', assignee: 'designer', status: 'todo' });
  candidate.comments.push({ id: 'comment-1', task: 'task-1', by: 'owner', text: '@все Проверьте макет', at: 123 });
  candidate.notifs = [
    { ...candidate.notifs[0], text: 'forged', read: true },
    { ...candidate.notifs[1], text: 'forged', read: true },
    { id: 'injected', recipient: 'designer', by: 'editor', type: 'mention', text: 'forged', read: false },
  ];

  const result = reconcileWorkspaceNotifications(current, candidate, { actorMemberId: 'editor', revision: 5, now: 456 });

  assert.equal(result.comments[0].by, 'editor');
  assert.equal(
    result.notifs.some(item => item.id === 'injected'),
    false,
  );
  assert.deepEqual(
    result.notifs.find(item => item.id === 'for-owner'),
    current.notifs[0],
  );
  assert.equal(result.notifs.find(item => item.id === 'for-editor').read, true);
  assert.equal(result.notifs.find(item => item.id === 'for-editor').text, 'assigned you');
  assert.ok(result.notifs.some(item => item.id === 'n-5-assign-task-2-designer' && item.by === 'editor'));
  assert.ok(result.notifs.some(item => item.id === 'n-5-mention-comment-1-owner' && item.scope === 'workspace'));
  assert.ok(result.notifs.some(item => item.id === 'n-5-mention-comment-1-designer' && item.scope === 'workspace'));
  assert.equal(
    result.notifs.some(item => item.id === 'n-5-update-task-1-editor'),
    false,
  );

  const repeated = reconcileWorkspaceNotifications(result, structuredClone(result), { actorMemberId: 'editor', revision: 6, now: 789 });
  assert.deepEqual(repeated.notifs, result.notifs);
});

test('server reconciliation delivers an explicit self mention without self-notifying for broad mentions', () => {
  const current = workspace();
  current.revision = 8;
  current.tasks = [{ id: 'task-self', title: 'Самоупоминание', assignee: 'owner', status: 'todo' }];
  current.comments = [];
  current.notifs = [];
  const candidate = structuredClone(current);
  candidate.comments.push({
    id: 'comment-self',
    task: 'task-self',
    by: 'owner',
    text: '@Owner User проверьте себя; @все — общий контекст',
    at: 321,
  });

  const result = reconcileWorkspaceNotifications(current, candidate, { actorMemberId: 'owner', revision: 9, now: 654 });
  const selfNotifications = notificationsForMember(result, 'owner');

  assert.equal(selfNotifications.length, 1);
  assert.equal(selfNotifications[0].id, 'n-9-mention-comment-self-owner');
  assert.equal(selfNotifications[0].scope, 'direct');
  assert.equal(selfNotifications[0].text, 'mentioned you in');
  assert.equal(selfNotifications[0].snippet, '@Owner User проверьте себя; @все — общий контекст');
});
