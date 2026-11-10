import { D, S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { toast } from '../ui/toast.js';

let loading;
const load = () =>
  (loading ||= import('./archive.js').catch(error => {
    loading = null;
    throw error;
  }));
const context = () => JSON.stringify([getSessionGeneration(), D().ws.id, S.ui.currentUser?.role, S.ui.route, S.ui.params]);

export function registerArchiveActions(actions, inputs) {
  for (const [table, name] of [
    ...['restoreTask', 'purgeTask', 'restoreTrash', 'purgeTrash'].map(name => [actions, name]),
    ...['trashQuery', 'trashFilter'].map(name => [inputs, name]),
  ]) {
    const run = async element => {
      const before = context(),
        modal = S.ui.modals.at(-1),
        input = element ? { dataset: { ...element.dataset }, value: element.value } : undefined;
      try {
        await load();
        if (before !== context() || modal !== S.ui.modals.at(-1) || !S.ui.currentUser) return;
        if (table[name] === run) throw Error('Action unavailable.');
        return table[name](input);
      } catch {
        if (before === context()) toast('Unable to load this action. Reload the page and try again.', { kind: 'err' });
      }
    };
    table[name] = run;
  }
}
