export async function uploadResumeForecast(entries, { persistHandles = true } = {}) {
  const result = { automatic: 0, permission: 0, reselect: 0 };
  for (const entry of entries) {
    let permission = 'denied';
    if (entry.sourceHandle && persistHandles) {
      try {
        permission = await entry.sourceHandle.queryPermission({ mode: 'read' });
      } catch {
        /* Removed/unavailable source. */
      }
    }
    entry.resumeForecast = entry.sourceHandle && persistHandles ? (permission === 'granted' ? 'automatic' : 'permission') : 'reselect';
    result[entry.resumeForecast]++;
  }
  return result;
}
