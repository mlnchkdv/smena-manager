// Text for summaries/search only. Never rewrite the stored Markdown or TXT.
export function markdownText(value) {
  return String(value || '')
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
  return (
    String(value || '')
      .split(/\r?\n\s*\r?\n/)
      .map(part => markdownText(part.replace(/^\s*#{1,6}\s+.*$/gm, '')))
      .find(Boolean) || ''
  );
}
export function redundantMarkdownSummary(summary, source) {
  const normalize = value => markdownText(value).replace(/[-_]/g, '').toLocaleLowerCase();
  const text = normalize(firstMarkdownParagraph(source));
  const description = normalize(summary);
  return !!description && text.startsWith(description);
}
