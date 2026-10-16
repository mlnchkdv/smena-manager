import assert from 'node:assert/strict';
import test from 'node:test';
import { appLocationPath, parseAppLocation, resolveAppLocation } from '../../src/shared/app-location.js';

const data = {
  ws: { url: 'smena' },
  projects: [{ id: 'p1', key: 'WEB' }],
  tasks: [{ id: 't1', key: 'WEB-12', project: 'p1' }],
  files: [{ id: 'f1', project: 'p1' }],
  members: [{ id: 'm1' }],
  teams: [{ id: 'tm1' }],
};

test('app locations resolve copied project, task, and file links', () => {
  assert.deepEqual(resolveAppLocation('/smena/project/web', '', data), { route: 'project', params: { id: 'p1', tab: 'board' } });
  assert.deepEqual(resolveAppLocation('/smena/task/WEB-12', '', data), {
    route: 'project',
    params: { id: 'p1', tab: 'board' },
    drawer: 't1',
  });
  assert.deepEqual(resolveAppLocation('/smena/file/f1', '', data), {
    route: 'project',
    params: { id: 'p1', tab: 'files' },
    file: 'f1',
  });
});

test('app locations support regular routes and legacy hash links', () => {
  assert.deepEqual(parseAppLocation('/', '#notifications'), { kind: 'notifications', slug: '' });
  assert.deepEqual(resolveAppLocation('/smena/settings', '', data), { route: 'settings', params: {} });
  assert.deepEqual(resolveAppLocation('/', '#notifications', data), { route: 'notifications', params: {} });
});

test('unknown entities open the not-found page', () => {
  assert.deepEqual(resolveAppLocation('/smena/task/missing', '', data), { route: 'nowhere', params: {} });
});

test('current workspace state produces canonical URLs', () => {
  assert.equal(appLocationPath(data, { route: 'home', params: {}, drawer: null, modals: [] }), '/smena');
  assert.equal(appLocationPath(data, { route: 'project', params: { id: 'p1', tab: 'calendar' }, drawer: null, modals: [] }), '/smena/project/web/calendar');
  assert.equal(appLocationPath(data, { route: 'project', params: { id: 'p1' }, drawer: 't1', modals: [] }), '/smena/task/WEB-12');
  assert.equal(
    appLocationPath(data, { route: 'project', params: { id: 'p1' }, drawer: null, modals: [{ type: 'filePreview', file: { id: 'f1' } }] }),
    '/smena/file/f1',
  );
});
