import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectHost } from '../../deploy/vps/inspect-host.mjs';
test('read-only Ubuntu inspection distinguishes Google reachability from authorization and never triggers services', async () => {
  const calls = [],
    requests = [];
  const options = {
    domain: 'tasks.team.invalid',
    commit: 'a'.repeat(40),
    run: (program, args) => {
      calls.push([program, ...args]);
      return args[0] === 'show' ? 'ActiveState=active\nSubState=running\nMainPID=123\n' : '';
    },
    fetcher: async (url, init) => {
      requests.push(url);
      assert.equal(init.method, 'HEAD');
      return new Response(null, { status: 404 });
    },
    backend: async () => {},
    vhost: async () => {},
  };
  assert.equal((await inspectHost(options)).googleAuthorization, 'not checked');
  assert.equal(requests.length, 3);
  assert.equal(
    calls.some(call => call.some(arg => ['start', 'stop', 'restart', 'reload', 'enable', 'daemon-reload'].includes(arg))),
    false,
  );
  await assert.rejects(inspectHost({ ...options, run: () => 'ActiveState=failed' }), /not running/);
  await assert.rejects(
    inspectHost({
      ...options,
      backend: async () => {
        throw Error('release mismatch');
      },
    }),
    /mismatch/,
  );
  await assert.rejects(inspectHost({ ...options, fetcher: async () => new Response(null, { status: 503 }) }), /egress/);
});
