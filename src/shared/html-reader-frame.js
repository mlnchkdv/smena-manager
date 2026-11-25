// Serialized into the isolated document. Keep this function self-contained.
export function installHtmlReaderPosition() {
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  let scheduled = false;
  function report() {
    scheduled = false;
    let section = -1;
    for (let index = 0; index < headings.length; index++) {
      if (headings[index].getBoundingClientRect().top > 1) break;
      section = index;
    }
    const offset = section < 0 ? scrollY : -headings[section].getBoundingClientRect().top;
    parent.postMessage({ type: 'smena:reader-position', section, offset, y: scrollY }, '*');
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
    const { section, offset, y } = event.data;
    if (!Number.isInteger(section) || !Number.isFinite(offset) || !Number.isFinite(y)) return;
    const heading = headings[section];
    scrollTo({ top: heading ? scrollY + heading.getBoundingClientRect().top + offset : y, behavior: 'instant' });
  });
  addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
      parent.postMessage({ type: 'smena:reader-exit-focus' }, '*');
    }
  });
  parent.postMessage({ type: 'smena:reader-ready' }, '*');
}
