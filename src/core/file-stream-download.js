import { D, S } from './store.js';
import { createFileArchivePlan, STREAM_ZIP_POLICY } from '../shared/file-archive-policy.js';
import { toast } from '../ui/toast.js';

// Runs synchronously from the user gesture, including on mobile browsers.
// A pre-stream HTTP error must not replace the workspace with an API page.
export function streamSelectedFiles() {
  if (S.ui.fileDownload && S.ui.fileDownload.phase !== 'ready') return;
  const ids = [...(S.ui.fileSelection || [])];
  try {
    createFileArchivePlan(D(), ids, S.ui.currentUser?.role, STREAM_ZIP_POLICY);
    const form = document.createElement('form');
    form.method = 'POST';
    form.target = '_blank';
    form.rel = 'noopener';
    form.action = `/api/files/archive?account=${encodeURIComponent(S.ui.currentUser.id)}`;
    for (const [name, value] of Object.entries({ ids: JSON.stringify(ids), revision: String(S.ui.workspaceRevision) })) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    form.remove();
    toast('Manage streamed downloads in your browser. If interrupted, use smaller batches.');
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
}
