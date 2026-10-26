import { esc } from '../core/utils.js';

// Body is trusted renderer markup (already escaped by its producer). These
// wrappers own structure/semantics; route classes own placement, not control size.
export const collectionHeader = (body, classes = '') => `<header class="collection-header page-head ${esc(classes)}">${body}</header>`;
export const collectionToolbar = (body, label, classes = '') =>
  `<section class="collection-toolbar ${esc(classes)}" role="group" aria-label="${esc(label)}">${body}</section>`;
export const collectionSelection = (body, label, active, classes = '') =>
  `<section class="collection-selection ${esc(classes)}${active ? ' active' : ''}" role="group" aria-label="${esc(label)}">${body}</section>`;
