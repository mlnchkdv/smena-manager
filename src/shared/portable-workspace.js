import { bindWikiReferences, RELATION_TYPES } from './relations.js';
const IMPORTANCE = new Set(['low', 'medium', 'high', 'critical']);

const list = value => (Array.isArray(value) ? value : []);
const text = value => (typeof value === 'string' ? value.trim() : '');
const stringList = value => [...new Set(list(value).map(text).filter(Boolean))];
const normalizedName = value => text(value).toLocaleLowerCase('ru-RU');

function normalizedHttpUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed;
  } catch {
    return null;
  }
}

function uniqueId(preferred, used, idFactory, prefix) {
  const candidate = text(preferred);
  if (candidate && !used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let generated;
  do generated = idFactory(prefix);
  while (used.has(generated));
  used.add(generated);
  return generated;
}

function importShape(payload) {
  if (Array.isArray(payload)) return { notes: payload, vaultFolders: [], links: [], linkFolders: [] };
  if (!payload || typeof payload !== 'object') throw new TypeError('Import file must contain a JSON object or an array of notes.');
  if (payload.format === 'smena-manager-portable' && Number(payload.version) > 2)
    throw new TypeError('This import format is newer than this application supports.');
  const hasVaultFolders = Array.isArray(payload.vault_folders) || Array.isArray(payload.knowledgeFolders);
  return {
    notes: list(payload.notes || payload.knowledgeNotes),
    relations: list(payload.relations),
    vaultFolders: list(payload.vault_folders || payload.knowledgeFolders),
    links: list(payload.links),
    linkFolders: list(payload.link_folders || payload.linkFolders || (!hasVaultFolders ? payload.folders : [])),
  };
}

export function buildPortableWorkspace(data, exportedAt = new Date().toISOString()) {
  return {
    format: 'smena-manager-portable',
    version: 2,
    exported_at: exportedAt,
    notes: list(data.knowledgeNotes),
    vault_folders: list(data.knowledgeFolders).map(folder => ({
      id: folder.id,
      name: folder.name,
      parent_id: folder.parentId ?? folder.parent_id ?? null,
      created_at: folder.createdAt || folder.created_at || exportedAt,
    })),
    links: list(data.links),
    relations: list(data.relations).filter(edge => !edge.deletedAt && [edge.from, edge.to].every(key => /^(note|bookmark):/.test(key))),
    link_folders: list(data.linkFolders).map(folder => ({
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id ?? folder.parentId ?? null,
      color: folder.color || '#8B5CF6',
      created_at: folder.created_at || folder.createdAt || exportedAt,
    })),
  };
}

function importFolders(target, incoming, options) {
  const { idFactory, prefix, parentField, now, report } = options;
  const ids = new Set(target.map(folder => folder.id));
  const byPath = new Map(target.map(folder => [`${folder[parentField] || ''}\0${normalizedName(folder.name)}`, folder.id]));
  const sources = new Map();
  incoming.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || !text(raw.name)) {
      report.invalid.push({ kind: 'folder', index, reason: 'invalid-folder' });
      return;
    }
    const source = text(raw.id) || `import-folder-${index}`;
    if (sources.has(source)) report.invalid.push({ kind: 'folder', source, reason: 'duplicate-source-id' });
    else sources.set(source, raw);
  });
  const mapping = new Map();
  const visiting = new Set();
  let added = 0;
  let skipped = 0;
  function resolve(source, depth = 0) {
    if (mapping.has(source)) return mapping.get(source);
    const raw = sources.get(source);
    if (!raw) return ids.has(source) ? source : null;
    if (visiting.has(source) || depth > 100) {
      mapping.set(source, null);
      report.invalid.push({ kind: 'folder', source, reason: 'cyclic-folder' });
      return null;
    }
    visiting.add(source);
    const sourceParent = text(raw.parentId ?? raw.parent_id);
    const parent = sourceParent ? resolve(sourceParent, depth + 1) : null;
    visiting.delete(source);
    if ((sourceParent && !parent) || mapping.get(source) === null) {
      mapping.set(source, null);
      report.invalid.push({ kind: 'folder', source, reason: 'missing-parent' });
      return null;
    }
    const name = text(raw.name);
    const path = `${parent || ''}\0${normalizedName(name)}`;
    const existing = byPath.get(path);
    if (existing) {
      skipped += 1;
      mapping.set(source, existing);
      return existing;
    }
    const id = uniqueId(raw.id, ids, idFactory, prefix);
    target.push({
      id,
      name,
      [parentField]: parent,
      color: /^#[0-9a-f]{6}$/i.test(text(raw.color)) ? text(raw.color) : '#8B5CF6',
      createdAt: text(raw.createdAt || raw.created_at) || now,
      created_at: text(raw.created_at || raw.createdAt) || now,
    });
    byPath.set(path, id);
    mapping.set(source, id);
    added += 1;
    return id;
  }
  for (const source of sources.keys()) resolve(source);
  return { ids, mapping, added, skipped };
}

export function mergePortableWorkspace(current, payload, options = {}) {
  const imported = importShape(payload);
  const now = options.now || new Date().toISOString();
  const idFactory = options.idFactory || (prefix => prefix + Math.random().toString(36).slice(2, 10));
  const data = {
    ...current,
    knowledgeNotes: structuredClone(list(current.knowledgeNotes)),
    knowledgeFolders: [...list(current.knowledgeFolders)],
    links: [...list(current.links)],
    linkFolders: [...list(current.linkFolders)],
    relations: structuredClone(list(current.relations)),
  };
  const entityMapping = new Map();
  const importedNotes = [];
  const counts = { notes: 0, knowledgeFolders: 0, links: 0, linkFolders: 0, skipped: 0, invalid: 0 };

  const report = { invalid: [], skipped: [], conflicts: [] };
  const knowledgeFolders = importFolders(data.knowledgeFolders, imported.vaultFolders, { idFactory, prefix: 'kf', parentField: 'parentId', now, report });
  const knowledgeFolderIds = knowledgeFolders.ids;
  const knowledgeFolderMap = knowledgeFolders.mapping;
  counts.knowledgeFolders = knowledgeFolders.added;
  counts.skipped += knowledgeFolders.skipped;
  const noteIds = new Set(data.knowledgeNotes.map(note => note.id));
  const noteTitles = new Set(data.knowledgeNotes.map(note => normalizedName(note.title)));
  for (const raw of imported.notes) {
    if (!raw || typeof raw !== 'object') {
      counts.invalid += 1;
      continue;
    }
    let title = text(raw.title);
    const markdown = typeof (raw.formatted_markdown ?? raw.markdown ?? raw.content) === 'string' ? (raw.formatted_markdown ?? raw.markdown ?? raw.content) : '';
    if (!title || !markdown.trim()) {
      counts.invalid += 1;
      continue;
    }
    const existing = data.knowledgeNotes.find(note => (text(raw.id) && note.id === text(raw.id)) || normalizedName(note.title) === normalizedName(title));
    if (existing && String(existing.formatted_markdown ?? existing.markdown ?? existing.content ?? '') === markdown) {
      if (text(raw.id)) entityMapping.set(`note:${raw.id}`, `note:${existing.id}`);
      counts.skipped += 1;
      report.skipped.push({ kind: 'note', title, reason: 'identical-content' });
      continue;
    }
    if (existing) {
      report.conflicts.push({ kind: 'note', title, sourceId: raw.id || null, action: options.conflictPolicy === 'skip' ? 'skipped' : 'imported-copy' });
      if (options.conflictPolicy === 'skip') {
        if (text(raw.id)) entityMapping.set(`note:${raw.id}`, `note:${existing.id}`);
        counts.skipped += 1;
        continue;
      }
      const stem = title;
      let suffix = 2;
      while (noteTitles.has(normalizedName(title))) title = `${stem} (${suffix++})`;
    }
    const sourceFolder = text(raw.folderId ?? raw.folder_id);
    const id = uniqueId(raw.id, noteIds, idFactory, 'kn');
    if (text(raw.id)) entityMapping.set(`note:${raw.id}`, `note:${id}`);
    importedNotes.push(id);
    data.knowledgeNotes.push({
      ...raw,
      id,
      title,
      category: text(raw.category) || 'General',
      summary: text(raw.summary),
      extracted_skills: stringList(raw.extracted_skills),
      tags: stringList(raw.tags),
      wikilinks: stringList(raw.wikilinks),
      formatted_markdown: markdown,
      folderId: sourceFolder
        ? knowledgeFolderMap.has(sourceFolder)
          ? knowledgeFolderMap.get(sourceFolder)
          : knowledgeFolderIds.has(sourceFolder)
            ? sourceFolder
            : null
        : null,
      favorite: raw.favorite === true,
      createdAt: text(raw.createdAt || raw.created_at) || now,
      updatedAt: text(raw.updatedAt || raw.updated_at) || now,
    });
    noteTitles.add(normalizedName(title));
    counts.notes += 1;
  }

  const linkFolders = importFolders(data.linkFolders, imported.linkFolders, { idFactory, prefix: 'lf', parentField: 'parent_id', now, report });
  const linkFolderIds = linkFolders.ids;
  const linkFolderMap = linkFolders.mapping;
  counts.linkFolders = linkFolders.added;
  counts.skipped += linkFolders.skipped;
  const linkIds = new Set(data.links.map(link => link.id));
  const linkUrls = new Set(data.links.map(link => normalizedHttpUrl(link.url)?.toString()).filter(Boolean));
  for (const raw of imported.links) {
    if (!raw || typeof raw !== 'object') {
      counts.invalid += 1;
      continue;
    }
    const parsed = normalizedHttpUrl(raw.url);
    if (!parsed) {
      counts.invalid += 1;
      continue;
    }
    const normalizedUrl = parsed.toString();
    if (linkUrls.has(normalizedUrl)) {
      const existing = data.links.find(link => normalizedHttpUrl(link.url)?.toString() === normalizedUrl);
      if (text(raw.id) && existing) entityMapping.set(`bookmark:${raw.id}`, `bookmark:${existing.id}`);
      if (text(existing?.title) !== text(raw.title) || text(existing?.description) !== text(raw.description))
        report.conflicts.push({ kind: 'bookmark', title: text(raw.title), action: 'kept-existing', incoming: raw });
      counts.skipped += 1;
      continue;
    }
    const sourceFolder = text(raw.folder);
    const id = uniqueId(raw.id, linkIds, idFactory, 'ln');
    if (text(raw.id)) entityMapping.set(`bookmark:${raw.id}`, `bookmark:${id}`);
    data.links.push({
      id,
      url: normalizedUrl,
      title: text(raw.title) || parsed.hostname,
      description: text(raw.description),
      site_name: text(raw.site_name) || parsed.hostname.replace(/^www\./, ''),
      preview_image: text(raw.preview_image),
      favicon_url: text(raw.favicon_url),
      folder: sourceFolder ? (linkFolderMap.has(sourceFolder) ? linkFolderMap.get(sourceFolder) : linkFolderIds.has(sourceFolder) ? sourceFolder : '') : '',
      importance: IMPORTANCE.has(raw.importance) ? raw.importance : 'medium',
      tags: stringList(raw.tags).map(tag => tag.toLocaleLowerCase('ru-RU').replace(/^#/, '')),
      is_archived: raw.is_archived === true,
      is_read: raw.is_read === true,
      health_status: ['unknown', 'ok', 'broken'].includes(raw.health_status) ? raw.health_status : 'unknown',
      created_at: text(raw.created_at || raw.createdAt) || now,
      updated_at: text(raw.updated_at || raw.updatedAt) || now,
    });
    linkUrls.add(normalizedUrl);
    counts.links += 1;
  }

  for (const note of data.knowledgeNotes.filter(item => importedNotes.includes(item.id))) {
    note.wikiRefs = list(note.wikiRefs)
      .filter(ref => ref && typeof ref.label === 'string')
      .map(ref => ({ label: ref.label, target: entityMapping.get(`note:${ref.target}`)?.slice(5) || '' }));
  }
  bindWikiReferences(data.knowledgeNotes);
  const relationIds = new Set(data.relations.map(edge => edge.id));
  for (const edge of list(imported.relations)) {
    const from = entityMapping.get(edge?.from),
      to = entityMapping.get(edge?.to);
    if (!from || !to || from === to || !Object.hasOwn(RELATION_TYPES, edge?.type)) {
      report.invalid.push({ kind: 'relation', reason: 'unresolved-endpoint' });
      continue;
    }
    if (data.relations.some(item => !item.deletedAt && item.from === from && item.to === to && item.type === edge.type)) continue;
    data.relations.push({ id: uniqueId(edge.id, relationIds, idFactory, 'rel'), from, to, type: edge.type, createdAt: now });
  }
  counts.invalid += report.invalid.length;
  return { data, counts, report };
}
