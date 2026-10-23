import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { filePresetFilters, filePresetModified } from '../shared/file-presets.js';
export function filePresetsHtml() {
  const presets = S.ui.fileFilterPresets || [],
    selected = presets.find(item => item.id === S.ui.fileSelectedPreset),
    index = presets.indexOf(selected);
  return `<div class="files-preset-controls"><button class="btn btn-ghost btn-sm" data-a="saveFileFilter">${ic('bookmark-plus', 15)}Save file filters</button>${presets.length ? `<select class="select" data-in="fileFilterPreset" aria-label="Saved file filters"><option value="">Saved file filters</option>${presets.map(preset => `<option value="${esc(preset.id)}" ${selected === preset ? 'selected' : ''} translate="no">${esc(preset.name)}</option>`).join('')}</select>` : ''}${selected ? `${filePresetModified(selected, filePresetFilters(S.ui)) ? '<span class="badge">Modified filter</span>' : ''}<details class="files-preset-manage"><summary class="btn btn-ghost btn-sm">${ic('ellipsis', 16)}<span>Manage filter</span></summary><div><button class="btn btn-ghost btn-sm" data-a="updateFileFilter">Update with current filters</button><button class="btn btn-ghost btn-sm" data-a="renameFileFilter">Rename filter</button><button class="btn btn-ghost btn-sm" data-a="reorderFileFilter" data-direction="-1" ${index === 0 ? 'disabled' : ''}>Move filter up</button><button class="btn btn-ghost btn-sm" data-a="reorderFileFilter" data-direction="1" ${index === presets.length - 1 ? 'disabled' : ''}>Move filter down</button><button class="btn btn-ghost btn-sm" data-a="removeFileFilter">Remove saved file filter</button></div></details>` : ''}<small class="hint">On this device only</small></div>`;
}
