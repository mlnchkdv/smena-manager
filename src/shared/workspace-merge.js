const MISSING = Symbol('missing');

function clone(value) {
  return value === MISSING ? MISSING : structuredClone(value);
}

function equal(left, right) {
  if (left === MISSING || right === MISSING) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEntityArray(value) {
  return Array.isArray(value) && value.every(item => isPlainObject(item) && typeof item.id === 'string');
}

function mergeEntityArray(base, local, remote, path, conflicts) {
  const baseMap = new Map(base.map(item => [item.id, item]));
  const localMap = new Map(local.map(item => [item.id, item]));
  const remoteMap = new Map(remote.map(item => [item.id, item]));
  const ids = [...new Set([...remoteMap.keys(), ...localMap.keys(), ...baseMap.keys()])];
  const merged = [];

  for (const id of ids) {
    const value = mergeValue(
      baseMap.has(id) ? baseMap.get(id) : MISSING,
      localMap.has(id) ? localMap.get(id) : MISSING,
      remoteMap.has(id) ? remoteMap.get(id) : MISSING,
      `${path}[${id}]`,
      conflicts,
    );
    if (value !== MISSING) merged.push(value);
  }
  return merged;
}

function mergeObject(base, local, remote, path, conflicts) {
  const result = {};
  const keys = new Set([
    ...Object.keys(base === MISSING ? {} : base),
    ...Object.keys(local === MISSING ? {} : local),
    ...Object.keys(remote === MISSING ? {} : remote),
  ]);
  for (const key of keys) {
    const value = mergeValue(
      base !== MISSING && Object.hasOwn(base, key) ? base[key] : MISSING,
      local !== MISSING && Object.hasOwn(local, key) ? local[key] : MISSING,
      remote !== MISSING && Object.hasOwn(remote, key) ? remote[key] : MISSING,
      path ? `${path}.${key}` : key,
      conflicts,
    );
    if (value !== MISSING) result[key] = value;
  }
  return result;
}

function mergeValue(base, local, remote, path, conflicts) {
  if (equal(local, remote)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);

  if (isEntityArray(base) && isEntityArray(local) && isEntityArray(remote)) {
    return mergeEntityArray(base, local, remote, path, conflicts);
  }
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    return mergeObject(base, local, remote, path, conflicts);
  }

  conflicts.push(path || 'workspace');
  return clone(remote);
}

export function mergeWorkspaceData(base, local, remote) {
  const conflicts = [];
  const data = mergeValue(base, local, remote, '', conflicts);
  if (Array.isArray(data.activity)) data.activity.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  return { data, conflicts };
}
