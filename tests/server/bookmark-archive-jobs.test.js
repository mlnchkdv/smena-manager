import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookmarkArchiveJobs } from '../../src/server/bookmark-archive-jobs.js';

test('archive ledger recovers queued work, deduplicates lost responses and rechecks membership before attachment', async () => {
  const user = { id: 'profile', email: 'member@example.test' };
  let data = {
    revision: 1,
    members: [{ id: 'member', authProfileId: user.id, email: user.email, role: 'Member', status: 'active' }],
    links: [{ id: 'bookmark', url: 'https://example.com' }],
  };
  let captures = 0,
    release;
  const dependencies = {
    load: async () => structuredClone(data),
    mutate: async (change, revision) => {
      if (revision !== data.revision) throw Object.assign(new Error('Conflict'), { code: 'REVISION_CONFLICT' });
      data = change(structuredClone(data));
      data.revision++;
    },
    capture: async (_url, stage) => {
      captures++;
      await stage('resources');
      await new Promise(resolve => {
        release = resolve;
      });
      return { html: '<p>Saved</p>' };
    },
    save: async (_bookmark, _page, id) => ({ id, format: 'html' }),
  };
  const service = createBookmarkArchiveJobs(dependencies);
  const first = await service.create(user, [user], 'bookmark', 'idempotent-request-0001');
  await new Promise(resolve => setTimeout(resolve, 20));
  const retry = await service.create(user, [user], 'bookmark', 'idempotent-request-0001');
  assert.equal(retry.id, first.id);
  const restarted = createBookmarkArchiveJobs(dependencies);
  assert.equal((await restarted.list(user, [user], 'bookmark'))[0].id, first.id);
  await restarted.settle();
  assert.equal(captures, 1, 'another process respects the persisted lease');
  release();
  await service.settle();
  assert.equal((await service.list(user, [user], 'bookmark'))[0].phase, 'ready');
  assert.equal(data.links[0].pageSnapshots.length, 1);
  assert.equal((await restarted.create(user, [user], 'bookmark', 'idempotent-request-0001')).snapshot.id, first.id);
  assert.equal(captures, 1, 'response retry returns the already committed copy');
  await service.create(user, [user], 'bookmark', 'another-request-0002');
  await new Promise(resolve => setTimeout(resolve, 20));
  data.members[0].role = 'Viewer';
  release();
  await service.settle();
  assert.equal(data.links[0].pageSnapshots.length, 1, 'revoked write access blocks attachment');
  assert.equal((await service.list(user, [user], 'bookmark'))[0].phase, 'failed');

  data.members[0].role = 'Member';
  data._bookmarkArchiveJobs.push({
    id: 'queued-before-url-change',
    owner: user.id,
    bookmarkId: 'bookmark',
    url: 'https://example.net',
    phase: 'queued',
  });
  await restarted.list(user, [user], 'bookmark');
  await restarted.settle();
  const [outdated] = await restarted.list(user, [user], 'bookmark');
  assert.equal(outdated.phase, 'failed');
  assert.equal(outdated.code, 'PAGE_BOOKMARK_CHANGED');
  assert.equal(captures, 2, 'an outdated queued URL is never fetched');
});
