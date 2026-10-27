/* ---------------- POPOVERS ---------------- */
import { $, TODAY, iso, parse } from '../core/utils.js';
import { S, task } from '../core/store.js';
import { focusKey, render } from '../shell/render.js';

export function openPop(el, extra = {}) {
  const r = el.getBoundingClientRect();
  const d = el.dataset;
  S.ui.popOpener = focusKey(el);
  S.ui.pop = {
    type: d.pop,
    id: d.id,
    key: d.key,
    i: d.i != null ? +d.i : undefined,
    field: d.field,
    date: d.date,
    ...(d.pop === 'daylist' ? { calendarProject: d.project || '', calendarEvents: d.events === '1' } : {}),
    x: r.left,
    y: r.bottom + 4,
    top: r.top,
    w: r.width,
    q: '',
    ...extra,
  };
  if (d.pop === 'date') {
    const tk = task(d.id);
    const cur = S.ui.pop.id === '__form' ? S.ui.form[d.field] : d.field === 'subdue' ? tk?.subtasks[+d.i]?.due : tk?.[d.field];
    S.ui.pop.m = iso(cur ? parse(cur) : TODAY);
  }
  render();
  setTimeout(() => {
    const q = $('.pop input[data-pop-q]');
    const touchLayout = matchMedia('(pointer: coarse)').matches || innerWidth <= 640;
    if (q && !touchLayout) {
      q.focus();
      return;
    }
    const first = $('.pop.floating .mi[aria-checked="true"]') || $('.pop.floating .mi, .pop.floating button, .pop.floating input');
    first?.focus({ preventScroll: true });
  }, 10);
}
export function placePop() {
  const el = $('.pop.floating');
  const p = S.ui.pop;
  if (!el || !p) return;
  const vv = window.visualViewport;
  const viewport = {
    left: vv?.offsetLeft || 0,
    top: vv?.offsetTop || 0,
    width: vv?.width || innerWidth,
    height: vv?.height || innerHeight,
  };
  const heightCap = p.type === 'user' ? 560 : 420;
  el.style.maxHeight = `${Math.max(0, Math.min(heightCap, viewport.height - 16))}px`;
  const w = el.offsetWidth,
    h = el.offsetHeight;
  let x = p.x,
    y = p.y;
  const minX = viewport.left + 8,
    maxX = viewport.left + viewport.width - 8,
    minY = viewport.top + 8,
    maxY = viewport.top + viewport.height - 8;
  if (x + w > maxX) x = Math.max(minX, (p.right ? p.x : p.x + (p.w || 0)) - w);
  if (y + h > maxY) y = Math.max(minY, (p.top != null ? p.top - 4 : p.y) - h);
  x = Math.max(minX, Math.min(x, maxX - w));
  y = Math.max(minY, Math.min(y, maxY - h));
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}
export function closePop() {
  if (S.ui.pop) {
    S.ui.pop = null;
    render();
  }
}
export function tgt(p) {
  return p.id === '__form' ? S.ui.form : task(p.id);
}
