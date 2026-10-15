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
  const hasVaultFolders = Array.isArray(payload.vault_folders) || Array.isArray(payload.knowledgeFolders);
  return {
    notes: list(payload.notes || payload.knowledgeNotes),
    vaultFolders: list(payload.vault_folders || payload.knowledgeFolders),
    links: list(payload.links),
    linkFolders: list(payload.link_folders || payload.linkFolders || (!hasVaultFolders ? payload.folders : [])),
  };
}

export function buildPortableWorkspace(data, exportedAt = new Date().toISOString()) {
  return {
    format: 'smena-manager-portable',
    version: 1,
    exported_at: exportedAt,
    notes: list(data.knowledgeNotes),
    vault_folders: list(data.knowledgeFolders).map(folder => ({
      id: folder.id,
      name: folder.name,
      parent_id: folder.parentId ?? folder.parent_id ?? null,
      created_at: folder.createdAt || folder.created_at || exportedAt,
    })),
    links: list(data.links),
    link_folders: list(data.linkFolders).map(folder => ({
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id ?? folder.parentId ?? null,
      color: folder.color || '#8B5CF6',
      created_at: folder.created_at || folder.createdAt || exportedAt,
    })),
  };
}

export function mergePortableWorkspace(current, payload, options = {}) {
  const imported = importShape(payload);
  const now = options.now || new Date().toISOString();
  const idFactory = options.idFactory || (prefix => prefix + Math.random().toString(36).slice(2, 10));
  const data = {
    ...current,
    knowledgeNotes: [...list(current.knowledgeNotes)],
    knowledgeFolders: [...list(current.knowledgeFolders)],
    links: [...list(current.links)],
    linkFolders: [...list(current.linkFolders)],
  };
  const counts = { notes: 0, knowledgeFolders: 0, links: 0, linkFolders: 0, skipped: 0, invalid: 0 };

  const knowledgeFolderIds = new Set(data.knowledgeFolders.map(folder => folder.id));
  const knowledgeFoldersByName = new Map(data.knowledgeFolders.map(folder => [normalizedName(folder.name), folder.id]));
  const knowledgeFolderMap = new Map();
  for (const raw of imported.vaultFolders) {
    if (!raw || typeof raw !== 'object') {
      counts.invalid += 1;
      continue;
    }
    const name = text(raw.name);
    if (!name) {
      counts.invalid += 1;
      continue;
    }
    const sourceId = text(raw.id);
    const existingId = knowledgeFoldersByName.get(normalizedName(name));
    if (existingId) {
      if (sourceId) knowledgeFolderMap.set(sourceId, existingId);
      counts.skipped += 1;
      continue;
    }
    const id = uniqueId(sourceId, knowledgeFolderIds, idFactory, 'kf');
    data.knowledgeFolders.push({
      id,
      name,
      parentId: raw.parentId ?? raw.parent_id ?? null,
      createdAt: text(raw.createdAt || raw.created_at) || now,
    });
    knowledgeFoldersByName.set(normalizedName(name), id);
    if (sourceId) knowledgeFolderMap.set(sourceId, id);
    counts.knowledgeFolders += 1;
  }

  const noteIds = new Set(data.knowledgeNotes.map(note => note.id));
  const noteTitles = new Set(data.knowledgeNotes.map(note => normalizedName(note.title)));
  for (const raw of imported.notes) {
    if (!raw || typeof raw !== 'object') {
      counts.invalid += 1;
      continue;
    }
    const title = text(raw.title);
    const markdown = text(raw.formatted_markdown || raw.markdown || raw.content);
    if (!title || !markdown) {
      counts.invalid += 1;
      continue;
    }
    if ((text(raw.id) && noteIds.has(text(raw.id))) || noteTitles.has(normalizedName(title))) {
      counts.skipped += 1;
      continue;
    }
    const sourceFolder = text(raw.folderId ?? raw.folder_id);
    const id = uniqueId(raw.id, noteIds, idFactory, 'kn');
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
      folderId: sourceFolder ? knowledgeFolderMap.get(sourceFolder) || (knowledgeFolderIds.has(sourceFolder) ? sourceFolder : null) : null,
      favorite: raw.favorite === true,
      createdAt: text(raw.createdAt || raw.created_at) || now,
      updatedAt: text(raw.updatedAt || raw.updated_at) || now,
    });
    noteTitles.add(normalizedName(title));
    counts.notes += 1;
  }

  const linkFolderIds = new Set(data.linkFolders.map(folder => folder.id));
  const linkFoldersByName = new Map(data.linkFolders.map(folder => [normalizedName(folder.name), folder.id]));
  const linkFolderMap = new Map();
  for (const raw of imported.linkFolders) {
    if (!raw || typeof raw !== 'object') {
      counts.invalid += 1;
      continue;
    }
    const name = text(raw.name);
    if (!name) {
      counts.invalid += 1;
      continue;
    }
    const sourceId = text(raw.id);
    const existingId = linkFoldersByName.get(normalizedName(name));
    if (existingId) {
      if (sourceId) linkFolderMap.set(sourceId, existingId);
      counts.skipped += 1;
      continue;
    }
    const id = uniqueId(sourceId, linkFolderIds, idFactory, 'lf');
    data.linkFolders.push({
      id,
      name,
      parent_id: raw.parent_id ?? raw.parentId ?? null,
      color: /^#[0-9a-f]{6}$/i.test(text(raw.color)) ? text(raw.color) : '#8B5CF6',
      created_at: text(raw.created_at || raw.createdAt) || now,
    });
    linkFoldersByName.set(normalizedName(name), id);
    if (sourceId) linkFolderMap.set(sourceId, id);
    counts.linkFolders += 1;
  }

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
      counts.skipped += 1;
      continue;
    }
    const sourceFolder = text(raw.folder);
    const id = uniqueId(raw.id, linkIds, idFactory, 'ln');
    data.links.push({
      id,
      url: normalizedUrl,
      title: text(raw.title) || parsed.hostname,
      description: text(raw.description),
      site_name: text(raw.site_name) || parsed.hostname.replace(/^www\./, ''),
      preview_image: text(raw.preview_image),
      favicon_url: text(raw.favicon_url),
      folder: sourceFolder ? linkFolderMap.get(sourceFolder) || (linkFolderIds.has(sourceFolder) ? sourceFolder : '') : '',
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

  return { data, counts };
}
