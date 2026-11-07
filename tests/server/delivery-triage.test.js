import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryTriage } from '../../src/shared/delivery-triage.js';

test('delivery guidance distinguishes configuration, execution and actual receipt in both languages', () => {
  for (const lang of ['ru', 'en']) {
    const rows = deliveryTriage(
      ['storage', 'coordination', 'email', 'push', 'cron_stale', 'cron_degraded', 'delivery', 'outbox_stale'].map(code => ({ code })),
      lang,
    );
    assert.equal(rows.length, 8);
    assert.equal(rows.find(row => row.code === 'push').section, 'notif-push');
    assert.match(rows.find(row => row.code === 'cron_stale').text, /HTTP 200/);
    assert.match(rows.find(row => row.code === 'email').text, lang === 'ru' ? /получение/ : /mailbox/);
    assert.equal(
      rows.some(row => row.run || row.send || row.retry),
      false,
    );
  }
});

test('unrecognized provider details never enter the rendered guidance or create actions', () => {
  const rows = deliveryTriage([
    { code: 'email', secret: 'TOKEN', message: 'provider debug' },
    { code: 'email' },
    { code: '<script>secret</script>' },
    { code: '__proto__' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(JSON.stringify(rows).includes('TOKEN'), false);
  assert.equal(JSON.stringify(rows).includes('script'), false);
  assert.equal(rows[1].section, '');
  assert.deepEqual(deliveryTriage(null), []);
});
