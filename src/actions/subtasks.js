/* =====================================================================
   ACTIONS · SUBTASKS: open, navigate, rename, notes, promote
   ===================================================================== */
import { $, esc } from '../core/utils.js';
import { S, logAct, save, task, proj } from '../core/store.js';
import { mutateTaskCommand as mutate, toast } from '../ui/toast.js';
import { render } from '../shell/render.js';
import { A, BLUR, IN, createTask } from './actions.js';
import { copiedTaskCycle } from '../shared/task-cycles.js';

export const subOf = (t, sid) => t && t.subtasks.find(s => s.id === sid);
A.openSub = el => {
  S.ui.subOpen = { tid: el.dataset.id, sid: el.dataset.sid };
  S.ui.pop = null;
  render();
  setTimeout(() => $(matchMedia('(max-width: 640px)').matches ? '#subtask-position' : '#s-title')?.focus({ preventScroll: true }), 0);
};
A.closeSub = () => {
  S.ui.lastSub = S.ui.subOpen?.sid;
  S.ui.subOpen = null;
  render();
};
export const _rmSub = A.rmSub;
A.rmSub = el => {
  if (S.ui.subOpen?.sid === el.dataset.sid) {
    S.ui.subOpen = null;
  }
  _rmSub(el);
};
A.subNav = el => {
  const t = task(el.dataset.id);
  const i = t.subtasks.findIndex(s => s.id === S.ui.subOpen?.sid) + +el.dataset.d;
  if (t.subtasks[i]) {
    S.ui.subOpen = { tid: t.id, sid: t.subtasks[i].id };
    render();
    const navigation = $(+el.dataset.d < 0 ? '#subtask-previous' : '#subtask-next');
    (navigation && !navigation.disabled ? navigation : $('#subtask-position'))?.focus({ preventScroll: true });
  }
};
BLUR.commitSubTitle = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  const v = el.value.trim();
  if (s && v && v !== s.title)
    mutate(() => {
      s.title = v;
      t.updated = Date.now();
    });
};
IN.subNote = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (s) {
    s.note = el.value;
    save();
  }
};
A.promoteSub = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (!s) return;
  let n;
  if (
    !mutate(() => {
      n = createTask({
        title: s.title,
        project: t.project,
        cycleId: copiedTaskCycle(proj(t.project), t.cycleId),
        status: s.done ? 'done' : 'todo',
        assignee: s.assignee || t.assignee,
        priority: t.priority,
        due: s.due || null,
        labels: [...t.labels],
        desc: s.note ? `<p>${esc(s.note)}</p>` : '',
      });
      t.subtasks = t.subtasks.filter(x => x !== s);
      logAct('converted a subtask of', t, `into ${n.key}`);
    })
  )
    return;
  S.ui.subOpen = null;
  render();
  toast(`Converted to ${n.key}`, { action: 'Open', onAction: () => A.openTask({ dataset: { id: n.id } }) });
};
