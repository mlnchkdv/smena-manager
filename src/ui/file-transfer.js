import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
export function fileTransferPanel() {
  const state = S.ui.fileNativeTransfer;
  if (!state) return '';
  const phase = state.phase === 'ready' && state.expiresAt <= Date.now() ? 'expired' : state.phase;
  const labels = {
    preparing: 'Checking download access…',
    ready: 'Download checked. Ready to start.',
    failed: state.error,
    browser: 'Browser download requested. Check downloads in your browser; completion cannot be verified here.',
    expired: 'Download preparation expired. Check again before downloading.',
  };
  return `<section class="files-native-transfer" role="status"><strong>${esc(t(labels[phase]))}</strong><div class="row">${phase === 'ready' ? '<button class="btn btn-primary btn-sm" data-a="startPreparedFileStream">Start browser download</button>' : ['failed', 'expired', 'browser'].includes(phase) ? '<button class="btn btn-secondary btn-sm" data-a="retryFileStream">Check and retry</button>' : ''}<button class="btn btn-ghost btn-sm" data-a="cancelFileStream">${phase === 'preparing' ? 'Cancel' : 'Close'}</button></div>${['failed', 'browser'].includes(phase) ? '<p class="hint">If interrupted, select fewer files or use Download ZIP. Closing this panel does not cancel a browser-managed download.</p>' : ''}</section>`;
}
