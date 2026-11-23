import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogQuery, completeCatalogCascade } from '../../src/server/file-catalog-query.js';

const data = () => ({
  revision: 7,
  members: [{ id: 'm', name: 'Участник' }],
  projects: [
    { id: 'public', name: 'Public', fileFolders: [{ id: 'folder', name: 'Папка' }] },
    { id: 'secret', private: true, members: ['other'], name: 'Secret' },
  ],
  tasks: [{ id: 't', project: 'public', title: 'Задача' }],
  files: Array.from({ length: 1200 }, (_, i) => ({
    id: `f${i}`,
    name: `Файл ${i}`,
    project: i < 1100 ? 'public' : 'secret',
    folderId: 'folder',
    task: 't',
    type: 'text',
    bytes: 10,
    by: 'm',
    at: i,
  })),
  trash: [],
});

test('query returns a bounded page, exact counts and no private identities, including search and folder counts', () => {
  const db = data(),
    user = { id: 'm', role: 'editor' };
  const page = catalogQuery(db, user, {
    revision: 7,
    offset: 100,
    countFolders: [
      ['public', 'folder'],
      ['secret', 'folder'],
    ],
  });
  assert.equal(page.files.length, 100);
  assert.equal(page.total, 1100);
  assert.equal(page.allTotal, 1100);
  assert.equal(page.totalBytes, 11000);
  assert.equal(page.resultIds, null);
  assert.deepEqual(page.folderCounts, [
    ['public', 'folder', 1100],
    ['secret', 'folder', 0],
  ]);
  assert.equal(
    page.files.some(file => file.project === 'secret'),
    false,
  );
  assert.equal(catalogQuery(db, user, { revision: 7, project: 'secret' }).total, 0);
  const latest = catalogQuery(db, user, { snapshot: 'latest', limit: 25 });
  assert.equal(latest.revision, db.revision);
  assert.equal(latest.total, page.total);
  for (const extra of [{ offset: 25 }, { countsOnly: true }, { revision: 6 }])
    assert.throws(() => catalogQuery(db, user, { snapshot: 'latest', ...extra }), { code: 'REVISION_CONFLICT' });
  const found = catalogQuery(db, user, { revision: 7, query: 'файл 1099', limit: 25 });
  assert.deepEqual(found.resultIds, ['f1099']);
  assert.equal(catalogQuery(db, user, { revision: 7, context: 'public' }).total, 1100);
  for (const options of [{ revision: 6 }, { revision: 7, offset: -1 }, { revision: 7, limit: 500 }, { revision: 7, sort: 'bad' }])
    assert.throws(() => catalogQuery(db, user, options));
});

test('page boundaries survive unrelated changes and restart when a file moves across visited pages', () => {
  const db = data(),
    actor = { id: 'm', role: 'editor' };
  const query = (offset, boundary) => catalogQuery(db, actor, { revision: 7, sort: 'date', limit: 25, offset, boundary });
  const second = query(25);
  const forward = { end: 50, version: second.nextPrefix };
  db.revision++;
  const third = query(50, forward);
  assert.equal(third.restarted, false);
  assert.equal(third.page, 2);
  assert.equal(third.startPrefix, second.nextPrefix);
  const backward = { end: 50, version: third.startPrefix };
  assert.deepEqual(query(25, backward).files, second.files);
  const item = db.files.find(f => f.id === third.files[0].id);
  item.name = 'Updated';
  assert.deepEqual(query(50, forward).files, third.files);
  item.at = 3000;
  for (const [offset, boundary] of [
    [50, forward],
    [25, backward],
  ]) {
    const fresh = query(offset, boundary);
    assert.equal(fresh.page, 0);
    assert.equal(fresh.restarted, true);
    assert.equal(fresh.files[0].id, item.id);
  }
  db.files = db.files.filter(f => f.at < 50);
  assert.equal(query(50, forward).page, 0);
});

test('partial-client deletion stores all unloaded project/task files in recoverable trash', () => {
  const current = data();
  const incoming = { projects: [current.projects[1]], tasks: [], trash: [{ id: 'trash', kind: 'project', data: { project: current.projects[0], files: [] } }] };
  const result = completeCatalogCascade(current, incoming, current.files);
  assert.equal(result.filter(file => file.project === 'public').length, 0);
  // All files in this synthetic fixture point to t, so task deletion cascades too.
  assert.equal(incoming.trash[0].data.files.length, 1100);
  const retained = completeCatalogCascade(current, { projects: current.projects, tasks: current.tasks, trash: [] }, current.files);
  assert.deepEqual(retained, current.files);
});

test('count-only requests retain revision and canonical ACL checks without returning or sorting file rows', () => {
  const db = data(),
    user = { id: 'm', role: 'editor' };
  const options = {
    revision: 7,
    countsOnly: true,
    countFolders: [
      ['public', 'folder'],
      ['secret', 'folder'],
      ['missing', 'folder'],
    ],
  };
  assert.deepEqual(catalogQuery(db, user, options), {
    revision: 7,
    folderCounts: [
      ['public', 'folder', 1100],
      ['secret', 'folder', 0],
      ['missing', 'folder', 0],
    ],
  });
  assert.throws(() => catalogQuery(db, user, { ...options, revision: 6 }), { code: 'REVISION_CONFLICT' });
  assert.throws(() => catalogQuery(db, user, { ...options, countFolders: Array.from({ length: 33 }, () => ['public', 'folder']) }));
  db.members[0].role = 'Guest';
  assert.equal(catalogQuery(db, { ...user, role: 'admin' }, options).folderCounts[1][2], 0);
  db.members[0].status = 'deactivated';
  assert.throws(() => catalogQuery(db, user, options), { code: 'AUTH_REQUIRED' });
});

test('catalog reads recheck a role downgrade or deactivation after authentication', () => {
  const db = data();
  db.members[0].role = 'Member';
  const staleAdmin = { id: 'm', role: 'admin' };
  assert.equal(catalogQuery(db, staleAdmin, { revision: 7, project: 'secret' }).total, 0);
  db.members[0].status = 'deactivated';
  assert.throws(() => catalogQuery(db, staleAdmin, { revision: 7 }), { statusCode: 401 });
});
