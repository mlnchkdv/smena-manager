import { uploadFileKey } from './upload-queue.js';
import { fullUploadFingerprint } from './upload-journal.js';

// Never request a permission prompt on page load. Browsers without handles use
// the same verified original-file selection path (including mobile Safari).
export function uploadSourceActions(jobs) {
  const waiting = jobs.filter(job => job.phase === 'needs-file' && !job.sourceChecking);
  return {
    access: waiting.some(job => job.sourceHandle && !['changed', 'unavailable'].includes(job.sourceRecovery)),
    reselect: waiting.some(job => !job.sourceHandle || ['changed', 'unavailable', 'denied'].includes(job.sourceRecovery)),
  };
}

export async function recoverUploadSource(
  job,
  { current = () => true, requestAccess = false, fingerprint = fullUploadFingerprint, signal, onStatus = () => {} } = {},
) {
  const handle = job.sourceHandle;
  if (!current() || handle?.kind !== 'file') return null;
  const active = () => current() && !signal?.aborted;
  const status = value => {
    if (active()) onStatus(value);
  };
  try {
    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && requestAccess && active()) permission = await handle.requestPermission({ mode: 'read' });
    if (!active()) return null;
    if (permission !== 'granted') {
      status(permission === 'denied' ? 'denied' : 'permission');
      return null;
    }
    const file = await handle.getFile();
    if (!active()) return null;
    if (
      file.name !== job.name ||
      file.size !== job.bytes ||
      (!job.fingerprint?.startsWith('sha256-v2:') && uploadFileKey(file) !== uploadFileKey({ name: job.name, size: job.bytes, lastModified: job.lastModified }))
    ) {
      status('changed');
      return null;
    }
    status('checking');
    const hash = await fingerprint(file, signal);
    if (!active()) return null;
    if (job.fingerprint?.startsWith('sha256-v2:') && hash !== job.fingerprint) {
      status('changed');
      return null;
    }
    status('ready');
    return { file, fingerprint: hash };
  } catch (error) {
    status(error?.name === 'NotAllowedError' ? 'permission' : 'unavailable');
    return null; // Removed files, revoked permissions and unavailable disks are recoverable via reselect.
  }
}
