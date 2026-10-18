import assert from 'node:assert/strict';
import test from 'node:test';
import { createPollCoordinator } from '../../src/core/poll-coordinator.js';

test('one tab polls per account and another takes over an expired or future-dated lease', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const locks = { request: async (_name, callback) => callback() };
  let time = 1000;
  const first = createPollCoordinator({ locks, storage, now: () => time, id: 'first' });
  const second = createPollCoordinator({ locks, storage, now: () => time, id: 'second' });
  assert.equal(await first.shouldPoll('owner'), true);
  assert.equal(await second.shouldPoll('owner'), false);
  assert.equal(await second.shouldPoll('another-owner'), true);
  time += 13000;
  assert.equal(await second.shouldPoll('owner'), true);
  assert.equal(await first.shouldPoll('owner'), false);
  time = 500; // A clock correction cannot leave a tab permanently excluded.
  assert.equal(await first.shouldPoll('owner'), true);
  assert.equal(await first.shouldPoll(null), false);
});

test('blocked or unsupported storage and locks preserve independent polling', async () => {
  assert.equal(await createPollCoordinator({ id: 'fallback' }).shouldPoll('owner'), true);
  const locks = { request: async (_name, callback) => callback() };
  const storage = {
    getItem: () => {
      throw new Error('storage blocked');
    },
    setItem: () => {
      throw new Error('storage blocked');
    },
  };
  assert.equal(await createPollCoordinator({ locks, storage, id: 'blocked' }).shouldPoll('owner'), true);
});
