// Versions belong to the exact bytes read, never to a mutable provider-wide cursor.
const versions = new WeakMap();

export function rememberStorageVersion(data, token) {
  if (data && typeof data === 'object') versions.set(data, token || null);
  return data;
}

export function storageVersion(data) {
  return versions.get(data) || null;
}

export function copyStorageVersion(source, target) {
  return rememberStorageVersion(target, storageVersion(source));
}
