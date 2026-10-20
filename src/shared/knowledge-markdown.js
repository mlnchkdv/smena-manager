const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
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
  for (const line of lines) {
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
