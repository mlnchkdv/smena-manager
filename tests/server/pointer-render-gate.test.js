import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerRenderGate } from '../../src/shared/pointer-render-gate.js';

test('background catalog responses cannot detach a button between pointerdown and click', () => {
  const tasks = [],
    events = [];
  const gate = createPointerRenderGate(callback => tasks.push(callback));
  const render = () => events.push('render');
  gate.press();
  gate.request(render);
  gate.request(render);
  assert.deepEqual(events, []);
  gate.release();
  gate.request(render);
  events.push('click action');
  tasks.shift()();
  assert.deepEqual(events, ['click action', 'render'], 'Coalesce repeated renders, but retain the action');
});

test('a new gesture retains deferred work until its own release; idle/keyboard rendering remains immediate', () => {
  const tasks = [],
    events = [];
  const gate = createPointerRenderGate(callback => tasks.push(callback));
  gate.request(() => events.push('idle'));
  gate.press();
  gate.request(() => events.push('file page and draft'));
  gate.request(() => events.push('graph'));
  gate.release();
  gate.press();
  tasks.shift()();
  assert.deepEqual(events, ['idle']);
  gate.release();
  tasks.shift()();
  assert.deepEqual(events, ['idle', 'file page and draft', 'graph']);
});
