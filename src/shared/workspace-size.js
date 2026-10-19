export const WORKSPACE_TRANSPORT_MAX_BYTES = 4 * 1024 * 1024;
export const WORKSPACE_TRANSPORT_WARNING_BYTES = Math.floor(WORKSPACE_TRANSPORT_MAX_BYTES * 0.75);

const encoder = new TextEncoder();

export function jsonByteLength(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

export function workspaceTransportBytes(data, revision = 0) {
  return jsonByteLength({ data, revision });
}

export function workspaceFitsTransport(data, revision = 0) {
  return workspaceTransportBytes(data, revision) <= WORKSPACE_TRANSPORT_MAX_BYTES;
}

export function workspaceCapacity(bytes, maxBytes = WORKSPACE_TRANSPORT_MAX_BYTES) {
  const usedBytes = Math.max(0, Number(bytes) || 0);
  const limit = Math.max(1, Number(maxBytes) || WORKSPACE_TRANSPORT_MAX_BYTES);
  return {
    bytes: usedBytes,
    maxBytes: limit,
    warningBytes: Math.floor(limit * 0.75),
    percent: Math.round((usedBytes / limit) * 1000) / 10,
    status: usedBytes > limit ? 'over-limit' : usedBytes >= Math.floor(limit * 0.75) ? 'warning' : 'ok',
  };
}
