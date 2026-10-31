import { materialLink } from './material-links.js';
import { Marked } from 'marked';
import { knowledgeDisplayParts } from './knowledge-frontmatter.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const textHtml = value => escape(value).replace(/&amp;((?:#\d+|#x[\da-f]+|[a-z][\da-z]+);)/gi, '&$1');
export const knowledgeHeadingSlug = text =>
  String(text)
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-') || 'section';
function anchorName(value) {
  try {
    return knowledgeHeadingSlug(decodeURIComponent(value.slice(1)));
  } catch {
    return knowledgeHeadingSlug(value.slice(1));
  }
}
export function knowledgeReadingSource(note) {
  const source = knowledgeDisplayParts(note).body;
  if (note.sourceFormat === 'text') return source;
  const heading = source.match(/^\s{0,3}#\s+([^\r\n]+)(?:\r?\n|$)/);
  return heading && heading[1].replace(/\s+#+\s*$/, '').trim() === String(note.title || '').trim() ? source.slice(heading[0].length) : source;
}

function tableCells(line) {
  const cells = [],
    source = line.trim();
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

// Only use the grammar. The allowlisted renderer below owns all HTML; raw HTML
// and image sources never become executable markup or automatic requests.
const markdown = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: 'knowledgeEmbed',
      level: 'inline',
      start: src => src.indexOf('![['),
      tokenizer(src) {
        const match = /^!\[\[([^\]\n]+)\]\]/.exec(src);
        if (match) return { type: 'knowledgeEmbed', raw: match[0], text: match[1] };
      },
    },
    {
      name: 'knowledgeBlockMarker',
      level: 'block',
      start: src => src.match(/^\^[\w-]+[ \t]*(?:\n|$)/m)?.index,
      tokenizer(src) {
        const match = /^\^([\w-]+)[ \t]*(?:\n|$)/.exec(src);
        if (match) return { type: 'knowledgeBlockMarker', raw: match[0], id: match[1] };
      },
    },

    {
      name: 'knowledgeWiki',
      level: 'inline',
      start: src => src.indexOf('[['),
      tokenizer(src) {
        const match = /^\[\[([^\]\n]+)\]\]/.exec(src);
        if (match) return { type: 'knowledgeWiki', raw: match[0], text: match[1] };
      },
    },
    {
      name: 'knowledgeTable',
      level: 'block',
      tokenizer(src) {
        const lines = src.split('\n');
        if (!lines[0]?.includes('|') || !lines[1]?.includes('|')) return;
        const header = tableCells(lines[0]),
          separator = tableCells(lines[1]);
        if (!header.length || header.length !== separator.length || !separator.every(value => /^:?-{3,}:?$/.test(value))) return;
        let count = 2;
        const rows = [];
        while (lines[count]?.includes('|') && !/^\s*(?:```|~~~)/.test(lines[count])) rows.push(tableCells(lines[count++]));
        const cells = row => row.map(text => ({ text, tokens: this.lexer.inline(text) }));
        return {
          type: 'knowledgeTable',
          raw: lines.slice(0, count).join('\n') + (count < lines.length ? '\n' : ''),
          header: cells(header),
          rows: rows.map(cells),
          align: separator.map(value => (value.endsWith(':') ? (value.startsWith(':') ? 'center' : 'right') : 'left')),
        };
      },
    },
  ],
});

export function renderKnowledgeMarkdown(source, options = {}) {
  if (options.plainText) return `<pre class="knowledge-plain-text">${escape(source)}</pre>`;
  const headings = new Set();
  const externalLink = (href, label) =>
    /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  const inlines = (tokens = [], depth = 0) =>
    tokens
      .map(token => {
        if (depth > 32) return escape(token.raw);
        const child = () => inlines(token.tokens, depth + 1);
        switch (token.type) {
          case 'strong':
            return `<strong>${child()}</strong>`;
          case 'em':
            return `<em>${child()}</em>`;
          case 'del':
            return `<del>${child()}</del>`;
          case 'codespan':
            return `<code>${escape(token.text)}</code>`;
          case 'br':
            return '<br>';
          case 'knowledgeEmbed': {
            const ref = materialLink(token.text),
              budget = options.embedBudget || { count: 0 },
              stack = options.embedStack || [];
            const key = ref?.block ? `${ref.key}#^${ref.block}` : '';
            const block = key && ref.key.startsWith('note:') && options.resolveBlock?.(ref.key.slice(5), ref.block);
            if (!block || stack.includes(key) || stack.length >= 4 || budget.count >= 12)
              return `<span class="hint">${escape(options.embedUnavailableLabel || 'Block unavailable or recursive')}</span>`;
            budget.count++;
            return `<span class="knowledge-transclusion"><strong>${escape(block.title)}</strong>${renderKnowledgeMarkdown(block.source, { ...options, embedBudget: budget, embedStack: [...stack, key] })}</span>`;
          }
          case 'knowledgeWiki': {
            const material = materialLink(token.text);
            if (material)
              return `<button class="knowledge-wiki-link" data-a="${material.block ? 'openKnowledgeBlock' : 'openRelatedEntity'}" data-key="${escape(material.key)}" data-block="${escape(material.block || '')}">${escape(material.label)}</button>`;
            const target = options.wikiTargets?.get(token.text.trim().toLocaleLowerCase('ru-RU'));
            return target
              ? `<button class="knowledge-wiki-link" data-a="followKnowledgeWiki" data-id="${escape(target)}" data-source="${escape(options.sourceId || '')}">${escape(token.text)}</button>`
              : `<span class="knowledge-wiki-link unresolved" title="${escape(options.unresolvedLabel || 'Unresolved wiki link')}">${escape(token.text)}</span>`;
          }
          case 'link': {
            const asset = options.asset?.(token.href);
            if (asset)
              return `<button class="knowledge-wiki-link" data-a="openKnowledgeFilePage" data-id="${escape(asset.id)}" data-page="${asset.page || 1}">${child()}</button>`;
            return token.href.startsWith('#')
              ? `<a href="${escape(token.href)}" data-a="knowledgeAnchor" data-anchor="${escape(anchorName(token.href))}">${child()}</a>`
              : externalLink(token.href, child());
          }
          case 'image': {
            const asset = options.asset?.(token.href);
            if (asset)
              return asset.url
                ? `<img class="knowledge-inline-image" src="${escape(asset.url)}" alt="${escape(token.text)}">`
                : `<button class="btn btn-secondary" data-a="loadKnowledgeImage" data-id="${escape(asset.id)}">${escape(options.loadImageLabel || 'Load image')}: ${escape(token.text)}</button>`;
            if (!/^[a-z]+:|^\//i.test(token.href) && options.sourceId)
              return `<button class="knowledge-wiki-link" data-a="bindKnowledgeAsset" data-id="${escape(options.sourceId)}" data-path="${escape(token.href)}">${escape(options.bindImageLabel || 'Bind to a file')}: ${escape(token.text || token.href)}</button>`;
            return `<span class="knowledge-image-reference"><span>${escape(options.imageLabel || 'Image')}:</span> ${escape(token.text || options.imageLabel || 'Image')} ${/^https?:\/\//i.test(token.href) ? externalLink(token.href, escape(options.openImageLabel || 'Open image')) : `<span class="hint">(${escape(options.unavailableImageLabel || 'Image source unavailable')})</span>`}</span>`;
          }
          case 'html':
            return escape(token.raw);
          case 'text':
            return token.tokens ? child() : textHtml(token.text);
          case 'escape':
            return escape(token.text);
          default:
            return escape(token.raw || token.text || '');
        }
      })
      .join('');
  const blocks = (tokens, depth = 0, tight = false) =>
    tokens
      .map(token => {
        if (depth > 32) return `<pre>${escape(token.raw)}</pre>`;
        switch (token.type) {
          case 'knowledgeBlockMarker':
            return `<span class="knowledge-block-anchor" data-knowledge-block="${escape(token.id)}" tabindex="-1"></span>`;
          case 'space':
          case 'def':
            return '';
          case 'heading': {
            const level = Math.min(6, token.depth + 1),
              slug = knowledgeHeadingSlug(token.text);
            let anchor = slug,
              suffix = 1;
            while (headings.has(anchor)) anchor = `${slug}-${suffix++}`;
            headings.add(anchor);
            return `<h${level} data-knowledge-heading="${escape(anchor)}" tabindex="-1">${inlines(token.tokens)}</h${level}>`;
          }
          case 'paragraph':
          case 'text': {
            const body = inlines(token.tokens || [{ type: 'text', text: token.text }]);
            return tight || (token.tokens?.length === 1 && token.tokens[0].type === 'knowledgeEmbed') ? body : `<p>${body}</p>`;
          }
          case 'code':
            return `<pre><code>${escape(token.text)}</code></pre>`;
          case 'hr':
            return '<hr>';
          case 'blockquote':
            return `<blockquote>${blocks(token.tokens, depth + 1)}</blockquote>`;
          case 'list': {
            const tag = token.ordered ? 'ol' : 'ul';
            return `<${tag}${token.ordered && token.start !== 1 ? ` start="${Number(token.start) || 1}"` : ''}>${token.items.map(item => `<li>${item.task ? (item.checked ? '☑ ' : '☐ ') : ''}${blocks(item.tokens, depth + 1, !token.loose)}</li>`).join('')}</${tag}>`;
          }
          case 'knowledgeTable':
          case 'table': {
            const align = token.align.map(value => (['left', 'right', 'center'].includes(value) ? value : 'left'));
            const row = (cells, header = false) =>
              `<tr>${token.header.map((_, i) => `<${header ? 'th scope="col"' : 'td'} class="knowledge-table-${align[i]}">${inlines(cells[i]?.tokens)}</${header ? 'th' : 'td'}>`).join('')}</tr>`;
            return `<div class="knowledge-table-wrap" role="region" tabindex="0" aria-label="${escape(
              token.header
                .map(cell => cell.text)
                .join(' · ')
                .slice(0, 160),
            )}"><table><thead>${row(token.header, true)}</thead><tbody>${token.rows.map(cells => row(cells)).join('')}</tbody></table></div>`;
          }
          case 'html':
            return `<pre>${escape(token.raw)}</pre>`;
          default:
            return `<p>${escape(token.raw || token.text || '')}</p>`;
        }
      })
      .join('');
  try {
    return blocks(markdown.lexer(String(source || '')));
  } catch {
    return `<pre>${escape(source)}</pre>`;
  }
}
