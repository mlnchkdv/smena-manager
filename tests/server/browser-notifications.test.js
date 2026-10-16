import assert from 'node:assert/strict';
import test from 'node:test';
import { browserNotificationContent, browserNotificationPreferenceKey, canDeliverBrowserNotification } from '../../src/core/browser-notifications.js';

test('browser notification categories use independent personal preferences', () => {
  assert.equal(browserNotificationPreferenceKey({ type: 'mention' }), 'push_mention');
  assert.equal(browserNotificationPreferenceKey({ type: 'assign' }), 'push_assign');
  assert.equal(browserNotificationPreferenceKey({ type: 'comment' }), 'push_comment');
  assert.equal(browserNotificationPreferenceKey({ type: 'due' }), 'push_due');
  assert.equal(browserNotificationPreferenceKey({ type: 'update' }), null);

  assert.equal(canDeliverBrowserNotification({ type: 'mention' }, { push_mention: true }, 'granted'), true);
  assert.equal(canDeliverBrowserNotification({ type: 'mention' }, { push_mention: false }, 'granted'), false);
  assert.equal(canDeliverBrowserNotification({ type: 'mention' }, { push_mention: true }, 'denied'), false);
});

test('browser notification content resolves actor, task, and translated action', () => {
  const data = {
    members: [{ id: 'owner', name: 'Dmitry' }],
    tasks: [{ id: 'task-1', title: 'Проверить макет' }],
  };
  const content = browserNotificationContent({ by: 'owner', task: 'task-1', text: 'mentioned you in' }, data, value =>
    value === 'mentioned you in' ? 'упомянул вас в' : value,
  );

  assert.deepEqual(content, {
    title: 'Dmitry упомянул вас в',
    body: 'Проверить макет',
  });
});
