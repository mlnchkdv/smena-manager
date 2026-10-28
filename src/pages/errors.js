/* ---------- 404 / DENIED / FAILED ---------- */
import { esc } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { mem } from '../core/store.js';
import { t } from '../core/i18n.js';

export function page404() {
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('file-question', 20)}</div></div><span class="code">ERROR 404</span><h1>Page not found</h1><p>The page you're looking for was moved, deleted, or never existed. Check the link or head back home.</p><div class="row"><button class="btn btn-secondary" data-a="back">${ic('arrow-left', 14)}Go back</button><button class="btn btn-primary" data-a="go" data-r="home">Go to Home</button></div></div></div>`;
}
export function stateDenied(p) {
  const lead = mem(p?.lead);
  const owner = lead ? `<span translate="no">${esc(lead.name)}</span>` : t('the project owner');
  const request = t("Ask {owner} to add you, or request access and we'll let them know.").replace('{owner}', () => owner);
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">ERROR 403</span><h1>You don't have access</h1><p>${p ? `<b translate="no">${esc(p.name)}</b> ${t('is a private project.')} ` : ''}${request}</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="projects">Back to projects</button><button class="btn btn-primary" data-a="requestAccess" data-id="${esc(p?.id || '')}">Request access</button></div></div></div>`;
}
export function stateFailed() {
  return `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>Something went wrong.</h1><p>This section could not load. Check your connection or reload the page to get the latest app version.</p><div class="row"><button class="btn btn-secondary" data-a="go" data-r="home">Go to Home</button><button class="btn btn-primary" data-a="reload">${ic('refresh-cw', 14)}Reload page</button></div></div></div>`;
}
