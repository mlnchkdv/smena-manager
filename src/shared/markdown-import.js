import { extractWikiLinks } from './knowledge-links.js';

const text = value => (typeof value === 'string' ? value.trim() : '');

export function parseMarkdownFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: String(markdown || '') };
  const frontmatter = {};
  let arrayKey = '';
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (arrayKey && /^-\s+/.test(trimmed)) {
      frontmatter[arrayKey].push(
        trimmed
          .replace(/^-\s+/, '')
          .replace(/^['"]|['"]$/g, '')
          .trim(),
      );
      continue;
    }
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!value) {
      frontmatter[key] = [];
      arrayKey = key;
    } else {
      frontmatter[key] = value.replace(/^['"]|['"]$/g, '').trim();
      arrayKey = '';
    }
  }
  return { frontmatter, body: match[2] };
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  const unwrapped = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return unwrapped
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function filenameTitle(filename) {
  const stem = text(filename)
    .replace(/\.(?:md|markdown|txt)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return stem || 'Imported note';
}

function markdownTitle(markdown) {
  return (
    String(markdown || '')
      .match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m)?.[1]
      ?.trim() || ''
  );
}

function markdownSummary(body) {
  const paragraph = String(body || '')
    .split(/\r?\n\s*\r?\n/)
    .map(part => part.replace(/^\s*#{1,6}\s+.*$/gm, '').trim())
    .map(part =>
      part
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/[`*_>#-]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .find(Boolean);
  return (paragraph || 'Imported Markdown note.').slice(0, 500);
}

export function parseMarkdownNote(filename, source, options = {}) {
  const markdown = String(source || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!markdown) throw new TypeError('Markdown file is empty.');
  const { frontmatter, body } = parseMarkdownFrontmatter(markdown);
  const now = options.now || new Date().toISOString();
  const idFactory = options.idFactory || (prefix => prefix + Math.random().toString(36).slice(2, 10));
  const title = text(frontmatter.title) || markdownTitle(body) || filenameTitle(filename);
  return {
    id: idFactory('kn'),
    title,
    category: text(frontmatter.category) || 'Imported',
    summary: text(frontmatter.summary) || markdownSummary(body),
    extracted_skills: stringList(frontmatter.skills || frontmatter.extracted_skills),
    tags: stringList(frontmatter.tags).map(tag => tag.replace(/^#/, '')),
    wikilinks: extractWikiLinks(markdown),
    formatted_markdown: markdown,
    sourceFormat: 'markdown',
    folderId: options.folderId || null,
    favorite: false,
    createdBy: options.memberId || null,
    updatedBy: options.memberId || null,
    createdAt: now,
    updatedAt: now,
  };
}

// TXT has no frontmatter: keep its text, including significant indentation.
export function parseTextNote(filename, source, options = {}) {
  const body = String(source || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  if (!body.trim()) throw new TypeError('The note file is empty.');
  return {
    ...parseMarkdownNote(filename, body, options),
    title: filenameTitle(filename),
    category: 'Imported',
    summary: '',
    tags: [],
    extracted_skills: [],
    formatted_markdown: body,
    sourceFormat: 'text',
  };
}
