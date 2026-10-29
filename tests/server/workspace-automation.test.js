import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchWorkspaceAutomation, runWorkspaceAutomationBatch } from '../../src/server/workspace-automation.js';
import { workspaceScope } from '../../src/server/workspace-context.js';

const id = '11111111-1111-4111-8111-111111111111';
test('workspace automation keeps concurrent scopes isolated and reports partial failures', async () => {
  const results = await runWorkspaceAutomationBatch(['default', id], {
    run: async () => {
      const scope = workspaceScope();
      await Promise.resolve();
      assert.equal(workspaceScope(), scope);
      return { status: scope === id ? 'degraded' : 'ok' };
    },
  });
  assert.deepEqual(
    results.map(item => item.status),
    ['ok', 'degraded'],
  );
  assert.equal(workspaceScope(), 'default');
  const failed = await runWorkspaceAutomationBatch(['default', id], {
    run: async () => ({ status: 'ok' }),
    dispatch: async () => {
      throw Error('Unavailable');
    },
  });
  assert.equal(failed[1].status, 'failed');
});
test('fan-out only uses the deployment origin, refuses redirects and distinguishes HTTP success from execution', async () => {
  const env = { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'smena-manager.vercel.app', CRON_SECRET: 'test-only-secret' };
  const result = await dispatchWorkspaceAutomation(id, {
    env,
    fetcher: async (url, options) => {
      assert.equal(url, `https://smena-manager.vercel.app/api/cron/reminders?workspace=${id}`);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
      return new Response(JSON.stringify({ status: 'failed' }));
    },
  });
  assert.equal(result.status, 'failed');
  await assert.rejects(dispatchWorkspaceAutomation(id, { env, fetcher: async () => new Response('{}') }), /report/u);
  await assert.rejects(
    dispatchWorkspaceAutomation(id, { env: { ...env, VERCEL_PROJECT_PRODUCTION_URL: 'evil.test/path' }, fetcher: () => assert.fail('No credential sent') }),
    /origin/u,
  );
});
