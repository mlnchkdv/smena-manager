import { S } from '../core/store.js';
import { getSessionGeneration } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { registerLazyActions } from '../shared/lazy-actions.js';
function context() {
  return JSON.stringify([S.ui.currentUser?.id, S.ui.activeWorkspace, getSessionGeneration()]);
}
export function registerManagementActions(tables, names) {
  registerLazyActions(tables, names, {
    load: () => import('./management-actions.js'),
    identity: context,
    dialog: () => S.ui.modals.at(-1),
    onError: () => toast('Unable to load this action. Reload the page and try again.', { kind: 'err' }),
  });
}
