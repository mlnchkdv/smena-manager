// A background DOM replacement between pointerdown and click can swallow the
// click. Wait through the release's task (including its synthesized click).
export function createPointerRenderGate(schedule = callback => setTimeout(callback, 0)) {
  let pressed = false,
    settling = false,
    releaseId = 0;
  const pending = new Set();
  return {
    press() {
      pressed = true;
    },
    release() {
      pressed = false;
      settling = true;
      const id = ++releaseId;
      schedule(() => {
        if (id !== releaseId) return;
        settling = false;
        if (pressed) return;
        const callbacks = [...pending];
        pending.clear();
        callbacks.forEach(callback => callback());
      });
    },
    request(callback) {
      if (pressed || settling) pending.add(callback);
      else callback();
    },
  };
}
