// Rendering is not a retry policy. A failed context needs an explicit retry or
// a different session/revision/query before another provider request is sent.
export function createContextLoadGuard() {
  let active = null,
    failed = null;
  return {
    begin(key) {
      if (active !== null || failed === key) return false;
      active = key;
      return true;
    },
    end(key, failure = false) {
      if (active !== key) return;
      active = null;
      failed = failure ? key : null;
    },
    retry() {
      failed = null;
    },
  };
}
