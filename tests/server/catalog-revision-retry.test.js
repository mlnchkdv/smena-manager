import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalogWithRevisionRefresh as run } from '../../src/shared/catalog-revision-retry.js';
const conflict = () => Object.assign(new Error('Changed'), { code: 'REVISION_CONFLICT' });

test('a fenced catalog read refreshes once after concurrent metadata writes, never accepting a mismatched page', async () => {
  const calls = [];
  const result = await run(
    async () => {
      calls.push('read');
      if (calls.length === 1) throw conflict();
      return { revision: 10 };
    },
    async () => {
      calls.push('refresh');
    },
    () => true,
  );
  assert.deepEqual(calls, ['read', 'refresh', 'read']);
  assert.deepEqual(result, { revision: 10 });
  let attempts = 0;
  await assert.rejects(
    run(
      async () => {
        attempts++;
        throw conflict();
      },
      async () => {},
      () => true,
    ),
    { code: 'REVISION_CONFLICT' },
  );
  assert.equal(attempts, 2);
});

test('catalog retry never refreshes permission/network errors, dirty state or a changed account', async () => {
  for (const error of [
    Object.assign(new Error(), { code: 'ENTITY_FORBIDDEN' }),
    Object.assign(new Error(), { code: 'NETWORK_ERROR' }),
    Object.assign(conflict(), { staleSession: true }),
  ]) {
    await assert.rejects(
      run(
        async () => {
          throw error;
        },
        () => assert.fail('Must not refresh'),
        () => true,
      ),
      error,
    );
  }
  await assert.rejects(
    run(
      async () => {
        throw conflict();
      },
      () => assert.fail('Dirty state must not refresh'),
      () => false,
    ),
    { code: 'REVISION_CONFLICT' },
  );
  let allowed = true,
    attempts = 0;
  await assert.rejects(
    run(
      async () => {
        attempts++;
        throw conflict();
      },
      async () => {
        allowed = false;
      },
      () => allowed,
    ),
    { code: 'REVISION_CONFLICT' },
  );
  assert.equal(attempts, 1);
});
