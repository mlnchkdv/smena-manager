// A concurrent metadata save may invalidate a fenced read between query and
// hydration. Refresh once, never ignore the fence or retry authorization errors.
export async function readCatalogWithRevisionRefresh(read, refresh, canRefresh) {
  try {
    return await read();
  } catch (error) {
    if (error.code !== 'REVISION_CONFLICT' || error.staleSession || !canRefresh()) throw error;
    await refresh();
    if (!canRefresh()) throw error;
    return read();
  }
}
