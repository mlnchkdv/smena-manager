import { A } from '../actions/actions.js';
import { S, D } from '../core/store.js';
import { getSessionGeneration, listFileExports, createFileExport, advanceFileExport, cancelFileExport } from '../core/api.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
let loaded,
  busy = false;
const scope = () => JSON.stringify([S.ui.currentUser?.id, D().ws?.id || D().ws?.url, getSessionGeneration()]);
export function ensureFileExports() {
  const owner = scope();
  if (owner === loaded) return;
  loaded = owner;
  busy = false;
  S.ui.fileExports = [];
  queueMicrotask(() => void A.refreshFileExports());
}
A.refreshFileExports = async () => {
  const owner = scope();
  try {
    const result = await listFileExports();
    if (owner === scope()) S.ui.fileExports = result.jobs;
  } catch {
    if (owner === scope()) toast('Unable to load exports. Check connection and retry.', { kind: 'err' });
  }
  if (owner === scope()) render();
};
async function run(id, owner) {
  if (busy || owner !== scope()) return;
  busy = true;
  S.ui.fileExportRunning = id;
  render();
  try {
    do {
      const { job } = await advanceFileExport(id);
      if (owner !== scope()) return;
      S.ui.fileExports = [job, ...(S.ui.fileExports || []).filter(item => item.id !== job.id)];
      render();
      if (job.phase === 'ready' || document.hidden) break;
    } while (owner === scope());
  } catch (error) {
    if (owner === scope())
      toast(
        error.code === 'EXPORT_BUSY' ? 'Export is being prepared in another tab. Retry later.' : 'Export paused. Resume from the saved checkpoint or cancel.',
        { kind: 'info' },
      );
  } finally {
    if (owner === scope()) {
      busy = false;
      S.ui.fileExportRunning = null;
      render();
    }
  }
}
A.createFileExport = async () => {
  if (busy || S.ui.fileExportCreating) return;
  const owner = scope(),
    ids = [...(S.ui.fileSelection || [])];
  S.ui.fileExportCreating = true;
  render();
  try {
    const { job } = await createFileExport(ids);
    if (owner !== scope()) return;
    S.ui.fileExports = [job, ...(S.ui.fileExports || []).filter(item => item.id !== job.id)];
    await run(job.id, owner);
  } catch {
    if (owner === scope()) {
      toast('Unable to start export. Check access, file sizes and pending jobs.', { kind: 'err' });
      await A.refreshFileExports();
    }
  } finally {
    if (owner === scope()) {
      S.ui.fileExportCreating = false;
      render();
    }
  }
};
A.resumeFileExport = el => run(el.dataset.id, scope());
A.cancelFileExport = async el => {
  const owner = scope();
  try {
    await cancelFileExport(el.dataset.id);
    if (owner === scope()) await A.refreshFileExports();
  } catch {
    if (owner === scope()) toast('Unable to cancel export. Check connection and retry.', { kind: 'err' });
  }
};
