// Preserve exact Markdown ranges. Blank separators, fences and frontmatter stay raw.
export function markdownBlocks(source) {
  source = String(source || '');
  const lines = source.match(/[^\n]*(?:\n|$)/g) || [],
    out = [];
  let start = 0,
    at = 0,
    fence = '',
    meta = /^---\r?\n/.test(source),
    block = '';
  const push = () => {
    if (block.trim()) out.push({ start, end: at, raw: block, metadata: meta && start === 0 });
    block = '';
    start = at;
  };
  for (const line of lines) {
    if (!line) continue;
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    block += line;
    at += line.length;
    if (meta && start === 0 && at > source.indexOf('\n') + 1 && /^---\s*$/.test(line)) {
      push();
      meta = false;
      continue;
    }
    if (meta && start === 0) continue;
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = '';
    }
    if (!fence && !line.trim()) push();
  }
  push();
  return out;
}
export function replaceMarkdownBlock(source, index, value) {
  const block = markdownBlocks(source)[index];
  if (!block || block.metadata) throw new TypeError('Invalid block');
  return source.slice(0, block.start) + value + source.slice(block.end);
}
export function moveMarkdownBlock(source, index, direction) {
  const blocks = markdownBlocks(source),
    other = index + direction,
    a = blocks[Math.min(index, other)],
    b = blocks[Math.max(index, other)];
  if (!a || !b || a.metadata || b.metadata || ![1, -1].includes(direction)) return source;
  return source.slice(0, a.start) + b.raw.trimEnd() + '\n\n' + a.raw.trimEnd() + '\n\n' + source.slice(b.end);
}

export function editBlockRange(source, range, value) {
  if (source !== range.base || range.start < 0 || range.end < range.start || range.end > source.length) throw new TypeError('Block source changed');
  return {
    text: source.slice(0, range.start) + value + source.slice(range.end),
    range: { ...range, base: source.slice(0, range.start) + value + source.slice(range.end), end: range.start + value.length },
  };
}
