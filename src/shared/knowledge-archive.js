import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { buildPortableWorkspace } from './portable-workspace.js';
import { parseMarkdownNote, parseTextNote, parseMarkdownFrontmatter } from './markdown-import.js';
import { decodeNoteFile } from './knowledge-import.js';
import { materialLink } from './material-links.js';
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function archiveCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16);
}
export const ARCHIVE_LIMIT = 25 * 1024 * 1024;
export function archivePath(value, base = '') {
  const path = String(value).replace(/\\/g, '/');
  if (/^(?:\/|[a-z]+:)|\0/i.test(path)) return null;
  const parts = base ? base.split('/').filter(Boolean) : [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
const mime = name =>
  ({
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    pdf: 'application/pdf',
    csv: 'text/csv',
    json: 'application/json',
  })[name.split('.').pop().toLowerCase()] || 'application/octet-stream';
export function parseCollectionCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
    if (rows.length > 5000) throw Error('Too many CSV rows.');
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift() || [];
  return rows.map(values => Object.fromEntries(header.slice(0, 50).map((name, index) => [name, String(values[index] || '').slice(0, 2000)])));
}
export function readKnowledgeArchive(input, options = {}) {
  const bytes = new Uint8Array(input);
  if (bytes.length > ARCHIVE_LIMIT) throw Error('Archive limit: 25 MB.');
  let size = 0,
    count = 0;
  const entries = unzipSync(bytes, {
    filter: file => {
      size += file.originalSize;
      if (++count > 5000 || size > ARCHIVE_LIMIT || !archivePath(file.name)) throw Error('Archive paths or expanded size exceed limits.');
      return !file.name.endsWith('/');
    },
  });
  if (Object.values(entries).reduce((n, b) => n + b.length, 0) > ARCHIVE_LIMIT) throw Error('Expanded archive limit: 25 MB.');
  const manifest = entries['smena-knowledge.json'] ? JSON.parse(strFromU8(entries['smena-knowledge.json'])) : null;
  if (manifest) {
    if (
      !Array.isArray(manifest.files) ||
      manifest.files.length > 100 ||
      new Set(manifest.files.map(f => f?.id)).size !== manifest.files.length ||
      manifest.files.some(
        f => !f || typeof f.id !== 'string' || !/^[\p{L}\p{N}_.:@+-]{1,180}$/u.test(f.id) || typeof f.name !== 'string' || f.name.length > 255,
      )
    )
      throw Error('Invalid attachment manifest.');
    if (manifest.format !== 'smena-knowledge-archive' || manifest.version !== 1 || !manifest.payload) throw Error('Unsupported archive format.');
    return {
      payload: manifest.payload,
      files: (manifest.files || []).map(file => {
        if (!archivePath(file.path) || !entries[file.path]) throw Error('Missing archive attachment.');
        if ((file.bytes != null && file.bytes !== entries[file.path].length) || (file.crc32 && file.crc32 !== archiveCrc32(entries[file.path])))
          throw Error('Archive attachment integrity check failed.');
        return { ...file, data: entries[file.path] };
      }),
      source: 'smena',
      collections: 0,
    };
  }
  const idFactory = options.idFactory || (prefix => prefix + Math.random().toString(36).slice(2, 12));
  const notes = [],
    folders = [],
    files = [],
    paths = new Map(),
    folderIds = new Map();
  function folder(path) {
    if (!path) return null;
    if (folderIds.has(path)) return folderIds.get(path);
    const parts = path.split('/'),
      name = parts.pop(),
      parentId = folder(parts.join('/')),
      id = idFactory('kf');
    folderIds.set(path, id);
    folders.push({ id, name, parentId });
    return id;
  }
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith('__MACOSX/') || path.split('/').at(-1).startsWith('.')) continue;
    if (/\.(?:md|markdown|txt)$/i.test(path)) {
      const name = path.split('/').at(-1),
        source = decodeNoteFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (!source.trim()) continue;
      const note = (/\.txt$/i.test(name) ? parseTextNote : parseMarkdownNote)(name, source, {
        idFactory,
        folderId: folder(path.split('/').slice(0, -1).join('/')),
      });
      note.sourcePath = path;
      note.sourceProperties = parseMarkdownFrontmatter(source).frontmatter;
      const aliases = note.sourceProperties.aliases;
      note.aliases = [
        ...new Set([
          path.replace(/\.(md|markdown|txt)$/i, ''),
          ...(Array.isArray(aliases) ? aliases : typeof aliases === 'string' ? aliases.replace(/^\[|\]$/g, '').split(',') : []),
        ]),
      ]
        .map(v => String(v).trim())
        .filter(v => v && v.length <= 80)
        .slice(0, 50);
      notes.push(note);
      paths.set(path, `note:${note.id}`);
    } else {
      const id = idFactory('asset');
      files.push({ id, path, name: path.split('/').at(-1), mimeType: mime(path), data: bytes });
      paths.set(path, `file:${id}`);
    }
  }
  let collections = 0;
  for (const [path, bytes] of Object.entries(entries).filter(([path]) => /\.csv$/i.test(path))) {
    collections++;
    const name = path
      .split('/')
      .at(-1)
      .replace(/\.csv$/i, '')
      .slice(0, 80);
    for (const row of parseCollectionCsv(strFromU8(bytes))) {
      const title = row.Title || row.Name || row.title || row.name || row['Название'];
      const matching = notes.filter(note => note.title === title);
      if (matching.length === 1) {
        matching[0].tags = [...new Set([...matching[0].tags, name])];
        matching[0].sourceProperties = { ...matching[0].sourceProperties, ...row };
      }
    }
  }
  for (const note of notes) {
    if (note.sourceFormat === 'text') continue;
    note.assets = {};
    note.materialTargets = {};
    for (const match of note.formatted_markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^[a-z]+:|^\//i.test(href)) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(href.split('#')[0]);
      } catch {
        continue;
      }
      const target = paths.get(archivePath(decoded, note.sourcePath.split('/').slice(0, -1).join('/')));
      if (target?.startsWith('file:')) note.assets[href.replace(/^\.\//, '')] = target.slice(5);
      else if (target) note.materialTargets[href] = target;
    }
  }
  return { payload: { notes, vault_folders: folders, links: [], relations: [] }, files, source: 'markdown', collections };
}
const safeName = value =>
  String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .slice(0, 90) || 'material';
export function buildKnowledgeArchive(data, files = []) {
  const payload = buildPortableWorkspace(data),
    entries = {},
    descriptors = files.map(file => ({
      id: file.id,
      name: file.name,
      bytes: file.data.length,
      crc32: archiveCrc32(file.data),
      mimeType: file.mimeType,
      path: `assets/${encodeURIComponent(file.id)}-${safeName(file.name)}`,
    }));
  const notePaths = new Map(
    payload.notes.map(note => [note.id, `notes/${safeName(note.title)}--${encodeURIComponent(note.id)}.${note.sourceFormat === 'text' ? 'txt' : 'md'}`]),
  );
  const filePaths = new Map(descriptors.map(file => [file.id, file.path]));
  for (const note of payload.notes) {
    let source = note.formatted_markdown || '';
    if (note.sourceFormat !== 'text') {
      source = source.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (raw, bang, label) => {
        const ref = materialLink(label),
          wiki = note.wikiRefs?.find(r => r.label === label),
          key = ref?.key || (wiki?.target ? `note:${wiki.target}` : '');
        const separator = key.indexOf(':'),
          kind = key.slice(0, separator),
          id = key.slice(separator + 1);
        const path = kind === 'note' ? notePaths.get(id) : kind === 'file' ? filePaths.get(id) : '';
        if (!path) return raw;
        if (bang && ref?.block) return `![[${path.split('/').at(-1).replace(/\.md$/, '')}#^${ref.block}]]`;
        return `[${(ref?.label || label).replace(/[[\]]/g, '')}](${encodeURI('../' + path)}${ref?.block ? '#^' + ref.block : ''})`;
      });
      source = source.replace(/smena-file:([\p{L}\p{N}_.:@+-]{1,180})/gu, (raw, id) => (filePaths.has(id) ? encodeURI('../' + filePaths.get(id)) : raw));
      for (const [relative, id] of Object.entries(note.assets || {}))
        if (filePaths.has(id)) source = source.split(`](${relative})`).join(`](${encodeURI('../' + filePaths.get(id))})`);
    }
    entries[notePaths.get(note.id)] = strToU8(source);
    entries[notePaths.get(note.id) + '.json'] = strToU8(
      JSON.stringify({ title: note.title, typeId: note.typeId, properties: note.properties, tags: note.tags, aliases: note.aliases }, null, 2),
    );
  }
  descriptors.forEach((file, index) => {
    entries[file.path] = files[index].data;
  });
  entries['smena-knowledge.json'] = strToU8(JSON.stringify({ format: 'smena-knowledge-archive', version: 1, payload, files: descriptors }, null, 2));
  if (Object.values(entries).reduce((n, b) => n + b.length, 0) > ARCHIVE_LIMIT) throw Error('Archive limit: 25 MB.');
  return zipSync(entries, { level: 1 });
}
export function mapArchiveFiles(payload, mapping) {
  const next = structuredClone(payload);
  const mapped = id => (Object.hasOwn(mapping, id) && typeof mapping[id] === 'string' ? mapping[id] : null);
  for (const note of next.notes || []) {
    note.formatted_markdown = String(note.formatted_markdown || '')
      .replace(/smena-file:([\p{L}\p{N}_.:@+-]{1,180})/gu, (raw, id) => (mapped(id) ? `smena-file:${mapped(id)}` : raw))
      .replace(/\[\[file:([^|\]#]+)([^\]]*)\]\]/g, (raw, id, rest) => (mapped(id) ? `[[file:${mapped(id)}${rest}]]` : raw));
    if (note.assets) note.assets = Object.fromEntries(Object.entries(note.assets).map(([path, id]) => [path, mapped(id) || id]));
  }
  return next;
}
