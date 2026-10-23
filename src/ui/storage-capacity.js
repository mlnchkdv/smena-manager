import { S } from '../core/store.js';
import './file-translations.js';
import { esc } from '../core/utils.js';
import { fsize } from './helpers.js';
export function storageCapacityPanel() {
  const status = S.ui.systemStatus;
  if (!status?.capacities) return '';
  const labels = { core: 'Workspace core', catalog: 'File catalog', exports: 'Export checkpoints', knowledge: 'Knowledge base', bookmarks: 'Bookmarks' };
  const storage = status.fileStorage,
    counters = status.providerFailures;
  return `<section class="sblock storage-capacity"><h2>Data capacity</h2><p class="muted">Each data limit is independent of Google Drive free space.</p><dl>${Object.entries(
    status.capacities,
  )
    .map(
      ([key, item]) =>
        `<div class="capacity-row" data-state="${esc(item.status)}"><dt>${esc(labels[key] || key)}</dt><dd><b>${fsize(item.bytes)} / ${fsize(item.maxBytes)}</b> · ${item.percent}%${item.status !== 'ok' ? ' <span>Needs attention</span>' : ''}</dd></div>`,
    )
    .join(
      '',
    )}</dl>${storage ? `<dl><div class="capacity-row"><dt>Active logical file bytes</dt><dd>${fsize(storage.logical.knownBytes)}</dd></div><div class="capacity-row"><dt>Unique active stored bytes</dt><dd>${fsize(storage.activePhysical.knownBytes)}</dd></div><div class="capacity-row"><dt>Known retained bytes</dt><dd>${fsize(storage.retainedPhysical.knownBytes)}</dd></div><div class="capacity-row"><dt>File aliases</dt><dd>${storage.aliases}</dd></div></dl><p class="hint">Known metadata only. Backup-only objects and other Drive content are excluded; unknown sizes are not zero.</p><p class="hint"><span>Files with unknown size</span>: ${storage.logical.unknownFiles + storage.activePhysical.unknownFiles + storage.retainedPhysical.unknownFiles}</p>` : ''}${counters ? `<p class="hint"><span>Reported provider errors in this server instance</span>: ${counters.failures} · <span>Timeouts</span>: ${counters.timeouts} · <span>Quota errors</span>: ${counters.quota}</p>` : ''}</section>`;
}
