import { D, S } from './store.js';
import { downloadWorkspaceFile, getSessionGeneration } from './api.js';
import { render } from '../shell/render.js';
import { toast } from '../ui/toast.js';
import { createFileArchivePlan, ZIP_LIMIT_MESSAGE } from '../shared/file-archive-policy.js';
import { buildFileZip } from '../shared/file-zip.js';

const scope = () => JSON.stringify([S.ui.currentUser?.id, D().ws?.id || D().ws?.url, getSessionGeneration()]);
export async function downloadSelectedFiles(ids = [...(S.ui.fileSelection || [])]) {
  if (S.ui.fileDownload) return;
  const owner = scope();
  const controller = new AbortController();
  let plan;
  try {
    plan = createFileArchivePlan(D(), ids, S.ui.currentUser?.role);
  } catch (error) {
    return toast(error.message, { kind: 'err' });
  }
  const state = { controller, owner, done: 0, total: plan.length, bytes: 0 };
  S.ui.fileDownload = state;
  render();
  const validate = () => {
    if (scope() !== owner) throw new DOMException('The account changed.', 'AbortError');
    const current = createFileArchivePlan(D(), ids, S.ui.currentUser?.role);
    if (
      current.some(
        (item, i) =>
          item.file.id !== plan[i].file.id || item.file.storageName !== plan[i].file.storageName || item.file.storageFileId !== plan[i].file.storageFileId,
      )
    )
      throw Error('The selected files changed. Select them again.');
  };
  try {
    const blob = await buildFileZip(
      plan,
      async (file, options) => {
        try {
          const { blob } = await downloadWorkspaceFile(file.id, true, options);
          return new Uint8Array(await blob.arrayBuffer());
        } catch (error) {
          if (error.code === 'PREVIEW_TOO_LARGE') throw Error(ZIP_LIMIT_MESSAGE);
          throw error;
        }
      },
      {
        signal: controller.signal,
        validate,
        onProgress: progress => {
          Object.assign(state, progress);
          if (scope() !== owner) {
            controller.abort();
            return;
          }
          const meter = document.querySelector('.files-download-count');
          if (meter) meter.textContent = `${progress.done} / ${progress.total} · ${(progress.bytes / 1024 / 1024).toFixed(1)} MB`;
          const bar = document.querySelector('.files-download-progress progress');
          if (bar) bar.value = progress.done;
        },
      },
    );
    validate();
    controller.signal.throwIfAborted();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `smena-files-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    toast('ZIP download started.');
  } catch (error) {
    if (scope() === owner)
      toast(controller.signal.aborted || error.name === 'AbortError' ? 'ZIP download cancelled.' : error.message || 'Unable to create the ZIP.', {
        kind: 'err',
      });
  } finally {
    if (S.ui.fileDownload === state) {
      S.ui.fileDownload = null;
      render();
    }
  }
}
