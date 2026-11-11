// Text for summaries/search only. Never rewrite the stored Markdown or TXT.
export function markdownText(value) {
  return String(value || '')
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm, '')
    .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, row) =>
      row
        .split(/(?<!\\)\|/)
        .map(cell => cell.trim())
        .join(' · '),
    )
    .replace(/^\s*```[^\n]*$/gm, '')
    .replace(/!?\[([^\]]+)\]\([^\n)]+\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)/gm, '')
    .replace(/^\s*\[[ xX]\]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`+([^`]+)`+/g, (_, a, b, c, d) => a || b || c || d)
    .replace(/(^|\s)[*_]([^\n*_]+)[*_](?=$|[\s.,!?:;])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}
export function firstMarkdownParagraph(value) {
  const source = String(value || '').replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '');
  const clean = part => markdownText(part.replace(/^\s*#{1,6}\s+.*$/gm, ''));
  let start = 0;
  // A summary needs the first readable paragraph, not a normalized copy of
  // every paragraph in a multi-megabyte source.
  for (const boundary of source.matchAll(/\r?\n\s*\r?\n/g)) {
    const paragraph = clean(source.slice(start, boundary.index));
    if (paragraph) return paragraph;
    start = boundary.index + boundary[0].length;
  }
  return clean(source.slice(start));
}
export function redundantMarkdownSummary(summary, source) {
  const normalize = value => markdownText(value).replace(/[-_]/g, '').toLocaleLowerCase();
  const text = normalize(firstMarkdownParagraph(source));
  const description = normalize(summary);
  return !!description && text.startsWith(description);
}
