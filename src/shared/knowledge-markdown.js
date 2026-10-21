const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function knowledgeReadingSource(note) {
  const source = String(note.formatted_markdown || '');
  const heading = source.match(/^\s{0,3}#\s+([^\r\n]+)(?:\r?\n|$)/);
  return heading && heading[1].replace(/\s+#+\s*$/, '').trim() === String(note.title || '').trim() ? source.slice(heading[0].length) : source;
}
function inline(text) {
  const tokens = /`([^`]+)`|\*\*([^*]+)\*\*|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^\s)]+)\)/g;
  let out = '',
    start = 0;
  for (const match of text.matchAll(tokens)) {
    out += escape(text.slice(start, match.index));
    start = match.index + match[0].length;
    if (match[1]) out += `<code>${escape(match[1])}</code>`;
    else if (match[2]) out += `<strong>${escape(match[2])}</strong>`;
    else if (match[3]) out += `<span class="knowledge-wiki-link">${escape(match[3])}</span>`;
    else
      out += /^(https?:\/\/|mailto:|#)/i.test(match[5])
        ? `<a href="${escape(match[5])}" target="_blank" rel="noopener noreferrer">${escape(match[4])}</a>`
        : escape(match[4]);
  }
  return out + escape(text.slice(start));
}

function tableCells(line) {
  const cells = [];
  const source = line.trim();
  let cell = '',
    codeTicks = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\' && source[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (source[i] === '`') {
      let end = i + 1;
      while (source[end] === '`') end++;
      const count = end - i;
      if (!codeTicks) codeTicks = count;
      else if (codeTicks === count) codeTicks = 0;
      cell += source.slice(i, end);
      i = end - 1;
    } else if (source[i] === '|' && !codeTicks) {
      cells.push(cell.trim());
      cell = '';
    } else cell += source[i];
  }
  cells.push(cell.trim());
  if (source.startsWith('|')) cells.shift();
  if (cells.at(-1) === '' && source.endsWith('|')) cells.pop();
  return cells;
}

export function renderKnowledgeMarkdown(markdown) {
  const lines = String(markdown || '')
    .replace(/\r/g, '')
    .split('\n');
  let html = '',
    code = null,
    list = null;
  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeList();
      if (code !== null) {
        html += `<pre><code>${escape(code.join('\n'))}</code></pre>`;
        code = null;
      } else code = [];
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const headers = line.includes('|') ? tableCells(line) : [];
    const separators = headers.length && lines[i + 1]?.includes('|') ? tableCells(lines[i + 1]) : [];
    if (headers.length && headers.length === separators.length && separators.every(value => /^:?-{3,}:?$/.test(value))) {
      closeList();
      const alignments = separators.map(value => (value.endsWith(':') ? (value.startsWith(':') ? 'center' : 'right') : 'left'));
      const row = (cells, heading = false) => {
        const tag = heading ? 'th' : 'td';
        return `<tr>${headers.map((_, column) => `<${tag}${heading ? ' scope="col"' : ''} class="knowledge-table-${alignments[column]}">${inline(cells[column] || '')}</${tag}>`).join('')}</tr>`;
      };
      html += `<div class="knowledge-table-wrap" role="region" tabindex="0" aria-label="${escape(headers.join(' · ').slice(0, 160))}"><table><thead>${row(headers, true)}</thead><tbody>`;
      i++;
      while (lines[i + 1]?.includes('|') && !/^\s*```/.test(lines[i + 1])) html += row(tableCells(lines[++i]));
      html += '</tbody></table></div>';
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/);
    if (bullet) {
      const type = bullet[1] ? 'ul' : 'ol';
      if (list !== type) {
        closeList();
        html += `<${type}>`;
        list = type;
      }
      html += `<li>${inline(bullet[2]).replace(/^\[([ xX])\]\s*/, (_, v) => (v === ' ' ? '☐ ' : '☑ '))}</li>`;
    } else {
      closeList();
      if (heading) {
        const level = Math.min(6, Number(heading[1].length) + 1);
        html += `<h${level}>${inline(heading[2])}</h${level}>`;
      } else if (/^>\s?/.test(line)) html += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
      else if (/^\s*---+\s*$/.test(line)) html += '<hr>';
      else if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  if (code !== null) html += `<pre><code>${escape(code.join('\n'))}</code></pre>`;
  return html;
}
