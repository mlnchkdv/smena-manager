import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationPath, notificationUrl } from '../../src/shared/notification-links.js';

test('notification links include the encoded workspace and requested destination', () => {
  const data = { ws: { url: 'Смена Команда' } };
  assert.equal(notificationPath(data), '/%D0%A1%D0%BC%D0%B5%D0%BD%D0%B0%20%D0%9A%D0%BE%D0%BC%D0%B0%D0%BD%D0%B4%D0%B0/notifications');
  assert.equal(notificationPath(data, 'mytasks'), '/%D0%A1%D0%BC%D0%B5%D0%BD%D0%B0%20%D0%9A%D0%BE%D0%BC%D0%B0%D0%BD%D0%B4%D0%B0/mytasks');
  assert.equal(
    notificationUrl(data, 'notifications', 'https://preview.example.test/path'),
    'https://preview.example.test/%D0%A1%D0%BC%D0%B5%D0%BD%D0%B0%20%D0%9A%D0%BE%D0%BC%D0%B0%D0%BD%D0%B4%D0%B0/notifications',
  );
});

test('notification URLs reject non-web origins and unsafe route characters', () => {
  assert.equal(notificationUrl({ ws: { url: 'team' } }, '../notifications', 'javascript:alert(1)'), 'https://smena-manager.vercel.app/team/notifications');
});
