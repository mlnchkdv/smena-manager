export function normalizedPageUrl(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
export function applyBookmarkMetadata(draft, metadata, baseline) {
  const changed = [];
  const automatic = draft.pageAutofill || {};
  for (const key of ['title', 'description']) {
    // A slow response must never overwrite text the user typed or existing edits.
    if ((!baseline[key] || baseline[key] === automatic[key]) && (!draft[key] || draft[key] === automatic[key]) && metadata[key]) {
      draft[key] = String(metadata[key]).slice(0, key === 'title' ? 250 : 2000);
      automatic[key] = draft[key];
      changed.push(key);
    }
  }
  draft.pageAutofill = automatic;
  return changed;
}
