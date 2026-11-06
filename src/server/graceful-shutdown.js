export function createGracefulShutdown(server, { timeoutMs = 45000, onTimeout = () => process.exit(1) } = {}) {
  let closing = false;
  return () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      onTimeout();
    }, timeoutMs);
    timer.unref();
    // Stop accepting new requests; active writes may finish before the service
    // manager starts the next single writer. Never destroy them immediately.
    server.close(() => clearTimeout(timer));
    server.closeIdleConnections?.();
  };
}
