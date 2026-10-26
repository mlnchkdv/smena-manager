import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { disclosureAttributes } from './disclosure.js';

export function materialLocation(path, key) {
  return `<details class="material-location" tabindex="-1" data-a="keepMaterialLocation" ${disclosureAttributes(`location:${key}`)}><summary id="location-${esc(key)}" data-a="toggleMaterialLocation" aria-label="${esc(t('Show full path'))}: ${esc(path)}" translate="no">${ic('folder', 12)}<span class="material-location-short">${esc(path)}</span>${ic('chevron-down', 12)}</summary><div class="material-location-full" translate="no">${esc(path)}</div></details>`;
}
