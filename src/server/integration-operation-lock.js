// The VPS uses one canonical writer. Serialize one integration operation across
// its private upload journal and workspace root, without blocking other keys.
const operations = new Map();
export async function withIntegrationOperation(key, operation) {
  const previous = operations.get(key) || Promise.resolve();
  const pending = previous.catch(() => {}).then(operation);
  operations.set(key, pending);
  try {
    return await pending;
  } finally {
    if (operations.get(key) === pending) operations.delete(key);
  }
}
