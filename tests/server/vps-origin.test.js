import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { originConfiguration, configureOrigin } from '../../deploy/vps/configure-origin.mjs';

test('origin configuration preserves literal secrets and comments; rejects URL/IP/injection and duplicates', () => {
  const source = '# private\nAPP_ORIGIN=\nSESSION_SECRET=synthetic-secret\n';
  assert.equal(originConfiguration(source, 'Tasks.Team.invalid').text, source.replace('APP_ORIGIN=', 'APP_ORIGIN=https://tasks.team.invalid'));
  for (const value of ['http://team.invalid', '127.0.0.1', '*.team.invalid', 'team.invalid/path', 'team.invalid;echo'])
    assert.throws(() => originConfiguration(source, value));
  assert.throws(() => originConfiguration('APP_ORIGIN=\nAPP_ORIGIN=\n', 'team.invalid'));
  assert.equal(originConfiguration('PORT=3001', 'team.invalid').text, 'PORT=3001\nAPP_ORIGIN=https://team.invalid\n');
});

test('origin preparation defaults to no writes, is idempotent and never returns secret content', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smena-origin-'));
  try {
    const file = path.join(directory, 'smena.env'),
      source = 'APP_ORIGIN=\nSESSION_SECRET=synthetic-secret\n';
    await fs.writeFile(file, source);
    const preview = await configureOrigin(file, 'tasks.team.invalid');
    assert.equal(preview.written, false);
    assert.equal(await fs.readFile(file, 'utf8'), source);
    assert.equal(JSON.stringify(preview).includes('synthetic-secret'), false);
    assert.equal((await configureOrigin(file, 'tasks.team.invalid', { write: true })).written, true);
    assert.equal((await configureOrigin(file, 'tasks.team.invalid', { write: true })).changed, false);
    assert.equal(await fs.readFile(file, 'utf8'), source.replace('APP_ORIGIN=', 'APP_ORIGIN=https://tasks.team.invalid'));
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('smena-origin-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
