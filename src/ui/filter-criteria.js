import { esc } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
export const filterSummaryLabel = (label, criteria) => esc(t(label) + (criteria.length ? `: ${t('Active filters')} ${criteria.length}` : ''));
export function filterCriteria(criteria, action) {
  return criteria.length
    ? `<div class="catalog-criteria" role="group" aria-label="Active filters">${criteria.map(({ key, label, value }) => `<button class="btn btn-secondary btn-sm catalog-criterion" data-a="${action}" data-field="${key}" aria-label="${esc(t('Remove filter') + ': ' + t(label) + ': ' + value)}"><span translate="no">${esc(t(label))}: ${esc(value)}</span>${ic('x', 12)}</button>`).join('')}</div>`
    : '';
}
