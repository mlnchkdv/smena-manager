import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activateRelease } from '../../deploy/vps/transaction.mjs';
import { parseOptions, publishAssets } from '../../deploy/vps/manage.mjs';
import { verifyVhost, verifyBackend } from '../../deploy/vps/health.mjs';
import { domainInNginxDump } from '../../deploy/vps/lib.mjs';
import { createGracefulShutdown } from '../../src/server/graceful-shutdown.js';
import http from 'node:http';

function fixture(failAt, recoveryFails = false) {
  const state = { selected: 'old', backend: 'old', config: 'old', timer: true, status: '', calls: [] };
  let failed = false;
  const call =
    (name, effect = () => {}) =>
    async () => {
      state.calls.push(name);
      if (!failed && name === failAt) {
        failed = true;
        throw new Error('Injected activation failure');
      }
      if (recoveryFails && name === 'recoverApp') throw new Error('Injected recovery failure');
      effect();
    };
  const ops = {
    timerActive: async () => state.timer,
    stopTimer: call('stopTimer', () => {
      state.timer = false;
    }),
    startTimer: call('startTimer', () => {
      state.timer = true;
    }),
    assertCronIdle: call('assertCronIdle'),
    journal: async status => {
      state.status = status;
    },
    stopApp: call('stopApp', () => {
      state.backend = null;
    }),
    selectTarget: call('selectTarget', () => {
      state.selected = 'new';
    }),
    installConfig: call('installConfig', () => {
      state.config = 'new';
    }),
    validateConfig: call('validateConfig'),
    startApp: call('startApp', () => {
      state.backend = state.selected;
    }),
    backendHealthy: call('backendHealthy', () => assert.equal(state.backend, 'new')),
    reloadNginx: call('reloadNginx'),
    vhostHealthy: call('vhostHealthy', () => {
      assert.equal(state.config, 'new');
      assert.equal(state.backend, 'new');
    }),
    commit: call('commit'),
    restorePrevious: call('restorePrevious', () => {
      state.selected = 'old';
    }),
    restoreConfig: call('restoreConfig', () => {
      state.config = 'old';
    }),
    recoverApp: call('recoverApp', () => {
      state.backend = 'old';
    }),
    recoveredHealthy: call('recoveredHealthy', () => {
      assert.equal(state.backend, 'old');
      assert.equal(state.config, 'old');
    }),
  };
  return { state, ops };
}

test('release cutover stops cron and the old writer before selecting code; accepts only verified backend and frontend', async () => {
  const { state, ops } = fixture();
  await activateRelease(ops);
  assert.deepEqual([state.selected, state.backend, state.config, state.timer, state.status], ['new', 'new', 'new', true, 'ready']);
  assert.ok(state.calls.indexOf('stopApp') < state.calls.indexOf('selectTarget'));
  assert.ok(state.calls.indexOf('vhostHealthy') < state.calls.indexOf('startTimer'));
});

test('failures at every activation boundary restore previous code/config, never data, before resuming cron', async () => {
  for (const step of ['stopApp', 'selectTarget', 'installConfig', 'validateConfig', 'startApp', 'backendHealthy', 'reloadNginx', 'vhostHealthy', 'commit']) {
    const { state, ops } = fixture(step);
    await assert.rejects(activateRelease(ops), /previous code\/configuration restored/);
    assert.deepEqual([state.selected, state.backend, state.config, state.timer, state.status], ['old', 'old', 'old', true, 'rolled-back'], step);
    assert.ok(state.calls.indexOf('recoveredHealthy') < state.calls.indexOf('startTimer'));
  }
});

test('busy cron aborts before stopping the backend; failed recovery never resumes automation', async () => {
  const busy = fixture('assertCronIdle');
  await assert.rejects(activateRelease(busy.ops));
  assert.equal(busy.state.backend, 'old');
  assert.equal(busy.state.calls.includes('stopApp'), false);
  assert.equal(busy.state.timer, true);
  const failed = fixture('vhostHealthy', true);
  await assert.rejects(activateRelease(failed.ops), /Cron remains stopped/);
  assert.equal(failed.state.timer, false);
  assert.equal(failed.state.status, 'recovery-failed');
});

test('VPS health verifies the TLS vhost release, storage and access protection without calling cron', async () => {
  const sha = 'a'.repeat(40);
  const requests = [];
  const response = url => {
    const target = new URL(url).pathname;
    requests.push(target);
    if (target === '/') return new Response('<script type="module" src="/assets/app.js"></script>', { headers: { 'Content-Type': 'text/html' } });
    if (target === '/api/health') return Response.json({ status: 'ok', service: 'smena-manager', release: sha });
    if (target === '/api/auth/config') return Response.json({ deploymentReady: true, googleAuthEnabled: true, workspaceStorageAvailable: true });
    if (target === '/app-version.json') return Response.json({ version: sha });
    return new Response('{}', { status: 401 });
  };
  await verifyBackend(sha, { fetcher: async url => response(url) });
  await verifyVhost('tasks.team.invalid', sha, { fetcher: async url => response(url) });
  assert.equal(
    requests.some(url => url.includes('/cron/')),
    false,
  );
  await assert.rejects(verifyVhost('tasks.team.invalid', 'b'.repeat(40), { fetcher: async url => response(url) }), /mismatch/);
});

test('shared assets retain old lazy chunks and refuse same-name replacement with different bytes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-vps-assets-'));
  try {
    const source = path.join(directory, 'source'),
      target = path.join(directory, 'shared');
    await fs.mkdir(source);
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'old-hash.js'), 'old');
    await fs.writeFile(path.join(source, 'new-hash.js'), 'new');
    await publishAssets(source, target);
    assert.equal(await fs.readFile(path.join(target, 'old-hash.js'), 'utf8'), 'old');
    await publishAssets(source, target);
    await fs.writeFile(path.join(source, 'new-hash.js'), 'changed');
    await assert.rejects(publishAssets(source, target), /collision/);
    assert.equal(await fs.readFile(path.join(target, 'new-hash.js'), 'utf8'), 'new');
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-vps-assets-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('deployment arguments and existing virtual-host names are checked before configuration changes', () => {
  assert.equal(parseOptions(['update', '--ref', 'origin/main', '--fetch']).options.fetch, true);
  for (const args of [
    ['install', '--domain'],
    ['update', '--ref', 'x', '--ref', 'y'],
    ['rollback', '--unknown'],
  ])
    assert.throws(() => parseOptions(args));
  assert.equal(domainInNginxDump('server { listen 80; server_name tasks.team.invalid; }', 'tasks.team.invalid'), true);
  assert.equal(domainInNginxDump('server_name *.team.invalid;', 'tasks.team.invalid'), true);
  assert.equal(domainInNginxDump('# server_name tasks.team.invalid;\nserver_name other.team.invalid;', 'tasks.team.invalid'), false);
});

test('graceful shutdown drains an active response instead of destroying its write immediately', async t => {
  let releaseResponse, began;
  const started = new Promise(resolve => {
    began = resolve;
  });
  const server = http.createServer((_request, response) => {
    releaseResponse = () => response.end('saved');
    began();
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.closeAllConnections());
  const pending = fetch(`http://127.0.0.1:${server.address().port}`);
  await started;
  let timedOut = false;
  const shutdown = createGracefulShutdown(server, {
    timeoutMs: 1000,
    onTimeout: () => {
      timedOut = true;
    },
  });
  shutdown();
  shutdown();
  releaseResponse();
  assert.equal(await (await pending).text(), 'saved');
  assert.equal(timedOut, false);
});
