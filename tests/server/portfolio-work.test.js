import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioWork, findPortfolioRows } from '../../src/shared/portfolio-work.js';

test('portfolio excludes non-readable projects before risk totals and workload', () => {
  const projects = [
    {
      id: 'one',
      name: 'Проект One',
      lead: 'm',
      milestones: [
        { id: 'finished', date: '2026-01-01', completed: true },
        { id: 'next', name: 'Release', date: '2026-11-03' },
      ],
    },
  ];
  const work = portfolioWork(
    projects,
    [
      { project: 'one', status: 'todo', due: '2026-11-01', assignee: 'm' },
      { project: 'one', status: 'todo', due: null, assignee: null },
      { project: 'one', status: 'done', due: '2026-01-01' },
      { project: 'hidden', status: 'todo', due: '2026-01-01', assignee: 'secret' },
    ],
    '2026-11-07',
  );
  assert.deepEqual([work.open, work.overdue, work.unassigned], [2, 1, 1]);
  assert.deepEqual([...work.workload], [['m', 1]]);
  assert.equal(work.rows[0].progress, 33);
  assert.equal(work.rows[0].next.id, 'next');
  assert.equal(findPortfolioRows(work.rows, 'проект Release', true).length, 1);
  assert.equal(findPortfolioRows(work.rows, 'Owner', false, () => 'Owner').length, 1);
  assert.equal(findPortfolioRows(work.rows, 'secret').length, 0);
});

test('large portfolio sorts actionable rows first without losing zero-task projects', () => {
  const projects = Array.from({ length: 2000 }, (_, i) => ({ id: 'p' + i, name: 'Project ' + i }));
  const tasks = Array.from({ length: 10001 }, (_, i) => ({
    project: 'p' + (i % 1000),
    status: 'todo',
    assignee: 'm',
    due: i === 10000 ? '2026-01-01' : '2027-01-01',
  }));
  const work = portfolioWork(projects, tasks, '2026-11-07');
  assert.equal(work.rows.length, 2000);
  assert.equal(work.rows[0].project.id, 'p0');
  assert.equal(work.open, 10001);
  assert.equal(findPortfolioRows(work.rows, '', true).length, 1);
});
