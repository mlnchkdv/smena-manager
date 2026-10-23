import assert from 'node:assert/strict';
import test from 'node:test';
import {
  browserNotificationContent,
  browserNotificationPreferenceKey,
  canDeliverBrowserNotification,
  deliverBrowserNotification,
} from '../../src/core/browser-notifications.js';

test('a rejected browser notification never interrupts successful workspace refresh handling', () => {
  const previous = globalThis.Notification;
  try {
    globalThis.Notification = class {
      static permission = 'granted';
      constructor() {
        throw new TypeError('Use service worker notification delivery on this device');
      }
    };
    assert.equal(deliverBrowserNotification({ id: 'n', type: 'mention' }, {}, { push_mention: true }), null);
    let opened = false,
      closed = false;
    globalThis.Notification = class {
      static permission = 'granted';
      close() {
        closed = true;
      }
    };
    const alert = deliverBrowserNotification(
      { id: 'n', type: 'mention' },
      {},
      { push_mention: true },
      {
        onOpen: () => {
          opened = true;
        },
      },
    );
    assert.ok(alert);
    alert.onclick();
    assert.equal(opened, true);
    assert.equal(closed, true);
  } finally {
    if (previous === undefined) delete globalThis.Notification;
    else globalThis.Notification = previous;
  }
});

test('browser notification categories use independent personal preferences', () => {
  assert.equal(browserNotificationPreferenceKey({ type: 'mention' }), 'push_mention');
  assert.equal(browserNotificationPreferenceKey({ type: 'assign' }), 'push_assign');
  assert.equal(browserNotificationPreferenceKey({ type: 'comment' }), 'push_comment');
  assert.equal(browserNotificationPreferenceKey({ type: 'due' }), 'push_due');
  assert.equal(browserNotificationPreferenceKey({ type: 'security' }), 'push_security');
  assert.equal(browserNotificationPreferenceKey({ type: 'system' }), 'push_security');
  assert.equal(browserNotificationPreferenceKey({ type: 'update' }), 'push_update');

  assert.equal(canDeliverBrowserNotification({ type: 'mention' }, { push_mention: true }, 'granted'), true);
  assert.equal(canDeliverBrowserNotification({ type: 'mention' }, { push_mention: false }, 'granted'), false);
  assert.equal(canDeliverBrowserNotification({ type: 'mention' }, { push_mention: true }, 'denied'), false);
  assert.equal(canDeliverBrowserNotification({ type: 'security' }, { push_security: true }, 'granted'), true);
  assert.equal(canDeliverBrowserNotification({ type: 'system' }, { push_security: true }, 'granted'), true);
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
