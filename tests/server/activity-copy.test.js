import test from 'node:test';
import assert from 'node:assert/strict';
import { activityDateExtra, activityVerbForm, activityTransitionExtra, activityMoveExtra, activityCycleExtra } from '../../src/shared/activity-copy.js';
import { countLabel } from '../../src/shared/count-label.js';

test('new activity date values render independently of the creation language', () => {
  for (const [verb, field] of [
    ['changed due date of', 'due'],
    ['changed start date of', 'start'],
    ['set a subtask due date on', 'subtaskDue'],
  ]) {
    const activity = { verb, change: { field, value: '2026-10-30' }, extra: 'to 30 октября' };
    const before = JSON.stringify(activity);
    assert.equal(activityDateExtra(activity, 'en-US'), 'to Oct 30, 2026');
    assert.equal(activityDateExtra(activity, 'ru-RU'), 'на 30 октября 2026 г.');
    assert.equal(
      activityDateExtra(activity, 'en-US', iso => `custom ${iso}`),
      'to custom 2026-10-30',
    );
    assert.equal(JSON.stringify(activity), before);
    activity.change.value = null;
    assert.equal(activityDateExtra(activity, 'ru-RU'), '— дата удалена');
    assert.equal(activityDateExtra(activity, 'en-US'), '— date cleared');
  }
});
test('legacy dates translate only known unambiguous grammar without inventing a year', () => {
  const copy = (extra, locale = 'en-US') => activityDateExtra({ verb: 'changed due date of', extra }, locale);
  assert.equal(copy('to 30 октября'), 'to Oct 30');
  assert.equal(copy('to Oct 30', 'ru-RU'), 'на 30 октября');
  assert.equal(copy('to 29 февраля 2024 г.'), 'to Feb 29, 2024');
  assert.equal(copy('to 2026-10-30'), 'to Oct 30, 2026');
  for (const text of ['to 31 февраля', 'to 10/11', 'to custom text', 'to 2026-02-30']) assert.equal(copy(text), text);
  assert.equal(copy('(cleared)', 'ru-RU'), '— дата удалена');
  assert.equal(activityDateExtra({ verb: 'renamed', extra: 'to 30 октября' }, 'en-US'), null);
  assert.equal(activityDateExtra({ verb: 'changed due date of', extra: 'to 10/11', change: { field: 'start', value: null } }, 'en-US'), 'to 10/11');
});
test('Russian self actions use polite plural while other actors retain their form', () => {
  assert.equal(activityVerbForm('назначил(а)', true, 'ru-RU'), 'назначили');
  assert.equal(activityVerbForm('изменил(а) срок', true, 'ru-RU'), 'изменили срок');
  assert.equal(activityVerbForm('создал(а)', false, 'ru-RU'), 'создал(а)');
  assert.equal(activityVerbForm('assigned', true, 'en-US'), 'assigned');
});
test('legacy status transitions translate known labels without changing arbitrary text', () => {
  assert.equal(activityTransitionExtra('from Done to To Do', 'moved', 'ru-RU'), 'из «Готово» в «К выполнению»');
  assert.equal(activityTransitionExtra('from In progress to Review', 'moved', 'ru-RU'), 'из «В работе» в «На проверке»');
  assert.equal(activityTransitionExtra('from Done to To Do', 'moved', 'en-US'), null);
  assert.equal(activityTransitionExtra('from Custom to To Do', 'moved', 'ru-RU'), null);
  assert.equal(activityTransitionExtra('from __proto__ to To Do', 'moved', 'ru-RU'), null);
  assert.equal(activityTransitionExtra('from Done to To Do', 'renamed', 'ru-RU'), null);
});

test('project moves retain event-time labels and legacy moves never invent a status', () => {
  const activity = { verb: 'moved', change: { field: 'project', from: 'a', value: 'b', fromLabel: 'Old name', valueLabel: 'New name' } };
  assert.equal(activityMoveExtra(activity, 'ru-RU'), 'из проекта «Old name» в проект «New name»');
  assert.equal(activityMoveExtra(activity, 'en-US'), 'from project “Old name” to project “New name”');
  assert.equal(activityMoveExtra({ verb: 'moved', extra: 'to СозвонУм' }, 'ru-RU'), 'в «СозвонУм»');
  assert.equal(activityMoveExtra({ verb: 'moved', change: { field: 'status', from: 'done', value: 'todo' } }, 'ru-RU'), 'из «Готово» в «К выполнению»');
  assert.equal(activityMoveExtra({ verb: 'moved', change: { field: 'status', from: 'done', value: 'todo' } }, 'en-US'), 'from Done to To Do');
  assert.equal(activityMoveExtra({ verb: 'assigned', extra: 'to СозвонУм' }, 'ru-RU'), null);
});
test('shared material counts agree in Russian and English, including 21', () => {
  const counts = [0, 1, 2, 5, 21];
  assert.deepEqual(
    counts.map(n => countLabel(n, 'folder', 'ru-RU')),
    ['0 папок', '1 папка', '2 папки', '5 папок', '21 папка'],
  );
  assert.deepEqual(
    counts.map(n => countLabel(n, 'folder', 'en-US')),
    ['0 folders', '1 folder', '2 folders', '5 folders', '21 folders'],
  );
  assert.equal(countLabel(1, 'note', 'en-US'), '1 note');
  assert.equal(countLabel(22, 'note', 'ru-RU'), '22 заметки');
  assert.equal(countLabel(1, 'card', 'ru-RU'), '1 карточка');
  assert.equal(countLabel(3, 'card', 'ru-RU'), '3 карточки');
  assert.equal(countLabel(11, 'card', 'ru-RU'), '11 карточек');
  assert.equal(countLabel(2, 'connection', 'ru-RU'), '2 связи');
  assert.equal(countLabel(1, 'connection', 'en-US'), '1 connection');
  assert.equal(countLabel(1, 'attachment', 'en-US'), '1 attachment');
  assert.equal(countLabel(2, 'attachment', 'ru-RU'), '2 вложения');
  assert.equal(countLabel(11, 'attachment', 'ru-RU'), '11 вложений');
  assert.equal(countLabel(1, 'team', 'en-US'), '1 team');
  assert.deepEqual(
    [0, 1, 2, 5, 11, 21].map(n => countLabel(n, 'comment', 'ru-RU')),
    ['0 комментариев', '1 комментарий', '2 комментария', '5 комментариев', '11 комментариев', '21 комментарий'],
  );
});

test('cycle activity retains the recorded name verbatim across languages and later configuration changes', () => {
  const activity = { verb: 'changed cycle of', change: { field: 'cycleId', value: 'c', valueLabel: 'Done / План' } };
  const before = structuredClone(activity);
  assert.equal(activityCycleExtra(activity, 'en-US'), 'to cycle “Done / План”');
  assert.equal(activityCycleExtra(activity, 'ru-RU'), 'в цикл «Done / План»');
  assert.deepEqual(activity, before);
  assert.equal(activityCycleExtra({ verb: 'changed cycle of', change: { field: 'cycleId', value: null } }, 'ru-RU'), '— без цикла');
  assert.equal(activityCycleExtra({ verb: 'changed cycle of', change: { field: 'cycleId', value: 'unknown' } }, 'en-US'), '— cycle changed');
  assert.equal(activityCycleExtra({ verb: 'moved', change: activity.change }, 'ru-RU'), null);
  assert.equal(activityCycleExtra({ verb: 'changed cycle of', extra: 'to legacy' }, 'ru-RU'), null);
});
