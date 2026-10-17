import assert from 'node:assert/strict';
import test from 'node:test';
import { captureUndo, completeUndo, undoCommand } from '../../src/shared/undo.js';
import { migrateMilestoneIds } from '../../src/shared/milestone-identity.js';

test('undo changes only command fields and keeps unrelated later edits', () => {
  const state = {
    tasks: [
      { id: 'a', archived: false, title: 'A' },
      { id: 'b', title: 'B' },
    ],
  };
  const command = captureUndo(state);
  state.tasks[0].archived = true;
  completeUndo(state);
  state.tasks[1].title = 'Later edit';
  state.tasks.push({ id: 'c', title: 'New task' });
  const result = undoCommand(command, state);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.data.tasks[0].archived, false);
  assert.equal(result.data.tasks[1].title, 'Later edit');
  assert.equal(result.data.tasks[2].id, 'c');
});

test('undo refuses to overwrite a subsequent change to the same field', () => {
  const state = { title: 'A' };
  const command = captureUndo(state);
  state.title = 'B';
  completeUndo(state);
  state.title = 'C';
  assert.deepEqual(undoCommand(command, state).conflicts, ['title']);
});

test('legacy milestone IDs are deterministic and survive reordering', () => {
  const source = { projects: [{ id: 'p', milestones: [{ name: 'First' }, { name: 'Second' }] }] };
  const first = migrateMilestoneIds(structuredClone(source));
  assert.deepEqual(first, migrateMilestoneIds(structuredClone(source)));
  const id = first.projects[0].milestones[0].id;
  first.projects[0].milestones.reverse();
  migrateMilestoneIds(first);
  assert.equal(first.projects[0].milestones[1].id, id);
});
