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
  const found = catalogQuery(db, user, { revision: 7, query: 'файл 1099', limit: 25 });
  assert.deepEqual(found.resultIds, ['f1099']);
  assert.equal(catalogQuery(db, user, { revision: 7, context: 'public' }).total, 1100);
  for (const options of [{ revision: 6 }, { revision: 7, offset: -1 }, { revision: 7, limit: 500 }, { revision: 7, sort: 'bad' }])
    assert.throws(() => catalogQuery(db, user, options));
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

test('catalog reads recheck a role downgrade or deactivation after authentication', () => {
  const db = data();
  db.members[0].role = 'Member';
  const staleAdmin = { id: 'm', role: 'admin' };
  assert.equal(catalogQuery(db, staleAdmin, { revision: 7, project: 'secret' }).total, 0);
  db.members[0].status = 'deactivated';
  assert.throws(() => catalogQuery(db, staleAdmin, { revision: 7 }), { statusCode: 401 });
});
