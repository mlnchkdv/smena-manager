import assert from 'node:assert/strict';
import test from 'node:test';
import { searchWorkspace } from '../../src/shared/workspace-search.js';

test('global search uses AND terms and quoted phrases across readable fields', () => {
  const data = { knowledgeNotes: [{ id: 'a', title: 'Команда', formatted_markdown: 'Правила безопасности и новый процесс' }] };
  assert.equal(searchWorkspace(data, 'команда безопасности').knowledge.length, 1);
  assert.equal(searchWorkspace(data, '"новый процесс" команда').knowledge.length, 1);
  assert.equal(searchWorkspace(data, '"процесс новый"').knowledge.length, 0);
});

test('search is bounded, handles missing descriptions and includes workspace files without exposing private projects', () => {
  const data = {
    me: 'm',
    projects: [
      { id: 'public', name: 'Public' },
      { id: 'private', access: 'private', members: [] },
    ],
    tasks: [
      { id: 't', project: 'public', title: 'Match' },
      { id: 'hidden', project: 'private', title: 'Match' },
    ],
    comments: [{ id: 'c', task: 'hidden', text: 'Match' }],
    files: [{ id: 'file', name: 'Match.txt' }],
    knowledgeNotes: Array.from({ length: 1000 }, (_, i) => ({ id: String(i), title: 'Match' })),
  };
  const result = searchWorkspace(data, 'match');
  assert.deepEqual(
    result.tasks.map(task => task.id),
    ['t'],
  );
  assert.equal(result.comments.length, 0);
  assert.equal(result.files.length, 1);
  assert.equal(result.knowledge.length, 30);
  assert.equal(searchWorkspace(data, '').tasks.length, 0);
});

test('search scales linearly over 10,000 tasks and comments rather than repeating entity lookups', t => {
  const data = { me: 'm', projects: [{ id: 'p' }], tasks: [], comments: [] };
  for (let i = 0; i < 10000; i += 1) {
    data.tasks.push({ id: `t${i}`, project: 'p', title: `Task ${i}` });
    data.comments.push({ id: `c${i}`, task: `t${i}`, text: `Comment ${i}` });
  }
  const started = performance.now();
  const result = searchWorkspace(data, '9999');
  const elapsed = performance.now() - started;
  assert.equal(result.tasks[0].id, 't9999');
  assert.equal(result.comments[0].id, 'c9999');
  t.diagnostic(`10k tasks + 10k comments: ${elapsed.toFixed(1)} ms`);
  assert.ok(elapsed < 2000, 'Search exceeded the regression guardrail');
});
