export const WORKSPACE_TRANSPORT_MAX_BYTES = 4 * 1024 * 1024;

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
