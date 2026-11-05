// A lazy tool must open once and only in the context which requested it.
export function createAsyncContextAction({ context, load, apply, pending = () => {}, failed = () => {} }) {
  let running = false;
  return async () => {
    if (running) return;
    const key = context();
    running = true;
    pending(true, key);
    try {
      const tool = await load();
      if (context() === key) await apply(tool);
    } catch (error) {
      if (context() === key) failed(error);
    } finally {
      running = false;
      pending(false, key);
    }
  };
}
