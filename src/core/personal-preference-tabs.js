import { S, D } from './store.js';
import { draftContext } from './offline-drafts.js';
import { PREFERENCE_CONFIRMATION_KEY, receivePersonalPreferences } from './personal-preferences.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { isRussian } from './i18n.js';

const seen = new Map();
let pending = false;
const editing = () => document.activeElement?.matches('input, textarea, [contenteditable="true"]');
function applyWhenIdle() {
  if (!pending || editing()) return;
  pending = false;
  render();
}
window.addEventListener('storage', event => {
  if (event.key !== PREFERENCE_CONFIRMATION_KEY || !event.newValue || !S.ui.currentUser?.id) return;
  try {
    const update = JSON.parse(event.newValue),
      context = draftContext(S.ui.currentUser, D());
    if (update.owner !== context.owner || update.workspace !== context.workspace) return;
    const scope = JSON.stringify([update.owner, update.workspace]);
    const order = Number.isSafeInteger(update.revision) ? update.revision : Number(update.at);
    if (!Number.isFinite(order) || order <= (seen.get(scope) || 0)) return;
    const valid = {
      theme: ['light', 'dark', 'system'],
      lang: ['Русский', 'English (US)', 'English (UK)'],
      density: ['comfortable', 'compact', 'default', 'comfy'],
    };
    const patch = Object.fromEntries(Object.entries(update.preferences || {}).filter(([key, value]) => valid[key]?.includes(value)));
    const applied = receivePersonalPreferences(context.owner, patch);
    seen.set(scope, order);
    if (!Object.keys(applied).some(key => S.prefs[key] !== applied[key])) return;
    // Update the sync baseline and preference model immediately, so an unrelated
    // save from this tab cannot write old settings back. Defer only the redraw.
    Object.assign(S.prefs, applied);
    if (!pending && editing())
      toast(
        isRussian()
          ? 'Настройки изменены в другой вкладке. Обновим интерфейс после ввода.'
          : 'Settings changed in another tab. The interface will update after editing.',
        { kind: 'info' },
      );
    pending = true;
    applyWhenIdle();
  } catch {
    /* Ignore malformed or unrelated local events. */
  }
});
document.addEventListener('focusout', () => setTimeout(applyWhenIdle, 100));
window.addEventListener('focus', applyWhenIdle);
