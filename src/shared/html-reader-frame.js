// Serialized into the isolated document. Keep this function self-contained.
export function installHtmlReaderPosition() {
  const selector = 'h1,h2,h3,h4,h5,h6';
  let sections;
  function getSections() {
    if (sections) return sections;
    const trail = [];
    sections = Array.from(document.querySelectorAll(selector), heading => {
      const level = Number(heading.tagName[1]);
      trail.length = level - 1;
      const label = heading.textContent.trim().replace(/\s+/g, ' ').slice(0, 128);
      const key = heading.id ? '#' + heading.id.slice(0, 160) : JSON.stringify([...trail.map(entry => entry?.label), label]);
      const entry = { heading, key, label };
      trail.push(entry);
      return { heading, path: trail.filter(Boolean).map(entry => entry.key) };
    });
    return sections;
  }
  new MutationObserver(changes => {
    if (
      changes.some(
        change =>
          change.target.parentElement?.closest(selector) ||
          change.target.closest?.(selector) ||
          [...change.addedNodes, ...change.removedNodes].some(node => node.matches?.(selector) || node.querySelector?.(selector)),
      )
    )
      sections = null;
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  let scheduled = false;
  function report() {
    scheduled = false;
    const headings = getSections();
    let section = -1;
    for (let index = 0; index < headings.length; index++) {
      if (headings[index].heading.getBoundingClientRect().top > 1) break;
      section = index;
    }
    const offset = section < 0 ? scrollY : -headings[section].heading.getBoundingClientRect().top;
    parent.postMessage({ type: 'smena:reader-position', path: headings[section]?.path || [], offset, y: scrollY }, '*');
  }
  addEventListener(
    'scroll',
    () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(report);
      }
    },
    { passive: true },
  );
  // A section jump belongs to the document, not the catalog's Back stack.
  addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    const hash = link?.getAttribute('href');
    if (!hash || hash.length < 2 || (link.target && link.target !== '_self')) return;
    let target;
    try {
      target = document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return;
    }
    if (target) {
      event.preventDefault();
      location.replace(hash);
    }
  });
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'smena:reader-restore') return;
    const { path, offset, y } = event.data;
    if (!Array.isArray(path) || !Number.isFinite(offset) || !Number.isFinite(y)) return;
    const headings = getSections();
    for (let index = path.length - 1; index >= 0; index--) {
      const match = headings.find(entry => entry.path.at(-1) === path[index]);
      if (match) {
        const delta = index === path.length - 1 ? offset : 0;
        scrollTo({ top: scrollY + match.heading.getBoundingClientRect().top + delta, behavior: 'instant' });
        return;
      }
    }
    scrollTo({ top: y, behavior: 'instant' });
  });
  addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
      parent.postMessage({ type: 'smena:reader-exit-focus' }, '*');
    }
  });
  const ready = () => requestAnimationFrame(() => parent.postMessage({ type: 'smena:reader-ready' }, '*'));
  if (document.readyState === 'complete') ready();
  else addEventListener('load', ready, { once: true });
}
