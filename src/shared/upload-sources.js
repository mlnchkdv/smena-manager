import { uploadFileKey } from './upload-queue.js';
import { fullUploadFingerprint } from './upload-journal.js';

// Never request a permission prompt on page load. Browsers without handles use
// the same verified original-file selection path (including mobile Safari).
export async function recoverUploadSource(job, { current = () => true, requestAccess = false, fingerprint = fullUploadFingerprint, signal } = {}) {
  const handle = job.sourceHandle;
  if (!current() || handle?.kind !== 'file') return null;
  try {
    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && requestAccess && current()) permission = await handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted' || !current() || signal?.aborted) return null;
    const file = await handle.getFile();
    if (!current() || file.name !== job.name || file.size !== job.bytes) return null;
    if (
      !job.fingerprint?.startsWith('sha256-v2:') &&
      uploadFileKey(file) !== uploadFileKey({ name: job.name, size: job.bytes, lastModified: job.lastModified })
    )
      return null;
    const hash = await fingerprint(file, signal);
    if (!current() || signal?.aborted || (job.fingerprint?.startsWith('sha256-v2:') && hash !== job.fingerprint)) return null;
    return { file, fingerprint: hash };
  } catch {
    return null; // Removed files, revoked permissions and unavailable disks are recoverable via reselect.
  }
}
