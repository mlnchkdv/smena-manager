// Reuse only a graph whose authorized topology still belongs to this session.
// A revision-fenced loading state has no replacement surface and is never reused.
export function retainGraphSurface(previous, replacement, scope) {
  if (
    !previous ||
    !replacement ||
    previous.dataset.graphScope !== scope ||
    !replacement.dataset.graphTopology ||
    previous.dataset.graphTopology !== replacement.dataset.graphTopology
  )
    return false;
  previous.setAttribute('aria-label', replacement.getAttribute('aria-label'));
  replacement.replaceWith(previous);
  return true;
}
