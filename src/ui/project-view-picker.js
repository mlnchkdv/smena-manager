import { IN } from '../actions/actions.js';
import { go } from '../shell/render.js';
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { PROJECT_TABS } from '../shared/project-tabs.js';
export function projectViewPicker(project, active, views, canSave) {
  return `<div class="project-view-picker" translate="no"><label class="sr" for="project-view-select">${t('Project views')}</label><select class="select" id="project-view-select" aria-label="${t('Project views')}" data-in="projectViewChoice" data-id="${esc(project.id)}">${[...PROJECT_TABS.map(([id, name]) => [id, t(name)]), ...views.map(v => ['v:' + v.id, v.name])].map(([id, name]) => `<option value="${esc(id)}" ${active === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>${canSave ? `<button class="ibtn" data-a="saveView" data-id="${esc(project.id)}" aria-label="${t('Save view')}" title="${t('Save view')}">${ic('bookmark-plus', 16)}</button>` : ''}</div>`;
}
let signature;
export function revealProjectView() {
  IN.projectViewChoice = el => go('project', { id: el.dataset.id, tab: el.value });
  const nav = document.querySelector('.proj-h > .tabs'),
    active = nav?.querySelector('[aria-current="page"]');
  if (!nav?.clientWidth || !active) return;
  const next = [active.dataset.id, active.dataset.tab, nav.clientWidth].join(':');
  if (next === signature) return;
  signature = next;
  const left = active.offsetLeft - nav.offsetLeft,
    right = left + active.offsetWidth;
  if (left < nav.scrollLeft) nav.scrollLeft = left;
  else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth;
}
