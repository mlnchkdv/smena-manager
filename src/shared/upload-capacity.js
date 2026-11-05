export function uploadCapacity(bytes, status, reserved = 0) {
  const quota = status?.quotaBytes,
    usage = status?.usageBytes;
  const known = Number.isFinite(quota) && quota > 0 && Number.isFinite(usage) && usage >= 0;
  const available = known ? Math.max(0, quota - usage - reserved) : null;
  return {
    bytes,
    availableBytes: available,
    sufficient: available === null ? null : bytes <= available,
    checkedAt: Date.now(),
    trashBytes: status?.trashUsageBytes ?? null,
  };
}
