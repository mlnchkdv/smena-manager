import test from 'node:test';
import assert from 'node:assert/strict';
import { teamTaskView } from '../../src/shared/team-task-view.js';
test('team task scopes distinguish assignees from projects, retaining every visible page', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({ id: i, project: 'p', assignee: i < 7 ? 'm' : 'other', status: 'todo' }));
  tasks.push({ id: 'done', project: 'p', assignee: 'm', status: 'done' }, { id: 'outside', project: 'q', assignee: 'm', status: 'todo' });
  assert.equal(teamTaskView(tasks, ['m'], ['p']).total, 8);
  const pages = [0, 1, 2].map(p => teamTaskView(tasks, ['m'], ['p'], 'projects', p));
  assert.equal(pages[0].total, 20);
  assert.deepEqual(
    pages.flatMap(p => p.rows.map(t => t.id)),
    Array.from({ length: 20 }, (_, i) => i),
  );
  assert.equal(teamTaskView(tasks, ['m'], ['p'], 'projects', 99).page, 2);
  assert.equal(teamTaskView([], [], []).start, 0);
  assert.equal(teamTaskView(tasks.slice(0, 7), ['m'], ['p']).pages, 1);
});
