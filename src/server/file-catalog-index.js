// A read model only. Never merge these rows into a writable workspace snapshot.
const FIELDS = ['id', 'name', 'project', 'folderId', 'task', 'by', 'type', 'bytes', 'at', 'tags', 'archived', 'is_archived'];
export function fileCatalogIndex(file) {
  return Object.fromEntries(FIELDS.filter(key => Object.hasOwn(file, key)).map(key => [key, file[key]]));
}
