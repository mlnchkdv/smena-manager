let observer;

// Measure the actual two-line excerpt, including wrapping after a viewport change.
export function refreshBookmarkReading() {
  observer?.disconnect();
  const descriptions = [...document.querySelectorAll('.bookmark-description')];
  if (!descriptions.length) return;
  const update = description => {
    const details = description.nextElementSibling;
    if (!details?.matches('.bookmark-reading-details') || details.open) return;
    details.hidden = description.scrollHeight <= description.clientHeight + 1;
  };
  observer = new ResizeObserver(entries => entries.forEach(({ target }) => update(target)));
  descriptions.forEach(description => {
    update(description);
    observer.observe(description);
  });
}
