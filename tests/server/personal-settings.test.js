import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPersonalSettings, persistReadStateBatches } from '../../src/shared/personal-settings.js';
import { bindAccessProfiles } from '../../src/shared/member-identity.js';

test('mark all read stays within the API limit, deduplicates IDs and stops after a failed batch', async () => {
  const ids = Array.from({ length: 1201 }, (_, index) => `n-${index}`);
  const batches = [];
  assert.equal(
    await persistReadStateBatches([...ids, ids[0]], true, async input => {
      batches.push(input);
      return true;
    }),
    true,
  );
  assert.deepEqual(
    batches.map(input => input.readState.ids.length),
    [500, 500, 201],
  );
  assert.deepEqual(
    batches.flatMap(input => input.readState.ids),
    ids,
  );
  let calls = 0;
  assert.equal(
    await persistReadStateBatches(ids, false, async () => {
      calls += 1;
      return calls < 2;
    }),
    false,
  );
  assert.equal(calls, 2);
});

test('personal updates are scoped to their actor, preserve protected preferences and survive profile binding', () => {
  const data = {
    me: 'other',
    members: [
      { id: 'me', email: 'me@test', name: 'Old', role: 'Guest' },
      { id: 'other', name: 'Other' },
    ],
    notifs: [
      { id: 'mine', recipient: 'me', read: false },
      { id: 'theirs', recipient: 'other', read: false },
    ],
    notifPrefs: { me: { emailDigestLastDate: '2026-10-18' }, other: { email_security: false } },
  };
  applyPersonalSettings(data, 'me', {
    preferences: { lang: 'English (US)', theme: 'dark', timeFmt: '24' },
    profile: { name: 'Saved', title: 'Designer' },
    notificationPreferences: { email_mention: true },
    readState: { ids: ['mine', 'theirs'], read: true },
  });
  assert.equal(data.members[0].role, 'Guest');
  assert.equal(data.members[0].locale, 'en');
  assert.equal(data._userPrefs.me.timeFmt, '24');
  assert.equal(data.notifPrefs.me.emailDigestLastDate, '2026-10-18');
  assert.equal(data.notifs[0].read, true);
  assert.equal(data.notifs[1].read, false);
  const rebound = bindAccessProfiles(data, [{ id: 'me', email: 'me@test', name: 'Configured', title: 'Old', active: true }]);
  assert.equal(rebound.members[0].name, 'Saved');
  assert.equal(rebound.members[0].title, 'Designer');
  assert.throws(() => applyPersonalSettings(data, 'me', { profile: { role: 'Owner' } }), /Invalid/u);
  assert.throws(() => applyPersonalSettings(data, 'me', { notificationPreferences: { emailDigestLastDate: true } }), /Invalid/u);
});
