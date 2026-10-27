import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { disclosureAttributes } from './disclosure.js';

// Body is trusted renderer markup (already escaped by its producer). These
// wrappers own structure/semantics; route classes own placement, not control size.
export const collectionHeader = (body, classes = '') => `<header class="collection-header page-head ${esc(classes)}">${body}</header>`;
export const collectionToolbar = (body, label, classes = '') =>
  `<section class="collection-toolbar ${esc(classes)}" role="group" aria-label="${esc(label)}">${body}</section>`;
export const collectionSelection = (body, label, active, classes = '') =>
  `<section class="collection-selection ${esc(classes)}${active ? ' active' : ''}" role="group" aria-label="${esc(label)}">${body}</section>`;
export const collectionOptions = (body, { key, label = 'View options', active = false } = {}) =>
  `<details class="ui-menu collection-options" ${disclosureAttributes(`collection-options:${key}`)}><summary class="btn btn-secondary" aria-label="${esc(label)}" title="${esc(label)}">${ic('sliders-horizontal', 15)}<span class="hide-m">${esc(label)}</span>${active ? '<span class="pdot" aria-label="Active filters"></span>' : ''}</summary><div class="collection-options-body">${body}</div></details>`;
