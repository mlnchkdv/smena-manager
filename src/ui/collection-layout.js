import { esc } from '../core/utils.js';
import { isRussian } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { disclosureAttributes } from './disclosure.js';

// Body is trusted renderer markup (already escaped by its producer). These
// wrappers own structure/semantics; route classes own placement, not control size.
export const collectionHeader = (body, classes = '') => `<header class="collection-header page-head ${esc(classes)}">${body}</header>`;
export const collectionToolbar = (body, label, classes = '') =>
  `<section class="collection-toolbar ${esc(classes)}" role="group" aria-label="${esc(label)}">${body}</section>`;
export const collectionSelection = (body, label, active, classes = '') =>
  `<section class="collection-selection ${esc(classes)}${active ? ' active' : ''}" role="group" aria-label="${esc(label)}">${body}</section>`;
export const catalogPanelDone = () =>
  `<div class="catalog-panel-footer"><button type="button" class="btn btn-primary" data-close-action-menu translate="no">${isRussian() ? 'Готово' : 'Done'}</button></div>`;

export function catalogFilterFooter(resetAction, count, closeAction) {
  const [reset, done] = isRussian() ? ['Сбросить фильтры', 'Готово'] : ['Clear filters', 'Done'];
  return `<div class="catalog-panel-footer catalog-filter-footer" translate="no">
    <button type="button" class="btn btn-ghost" data-a="${esc(resetAction)}" data-keep-menu ${count ? '' : 'disabled'}>${reset}</button>
    <button type="button" class="btn btn-primary" data-filter-done ${closeAction ? `data-a="${esc(closeAction)}"` : 'data-close-action-menu'}>${done}</button>
  </div>`;
}

export const collectionOptions = (body, { key, label = 'View options', active = false } = {}) =>
  `<details class="ui-menu collection-options" ${disclosureAttributes(`collection-options:${key}`)}><summary class="btn btn-secondary" aria-label="${esc(label)}" title="${esc(label)}">${ic('sliders-horizontal', 15)}<span class="hide-m">${esc(label)}</span>${active ? '<span class="pdot" aria-label="Active filters"></span>' : ''}</summary><div class="collection-options-body">${body}${catalogPanelDone()}</div></details>`;
