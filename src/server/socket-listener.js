// systemd owns the listening socket across single-writer process restarts.
// Fail closed on a malformed activation contract rather than binding another port.
export function apiListenOptions({ env = process.env, pid = process.pid, platform = process.platform } = {}) {
  if (env.LISTEN_FDS || env.LISTEN_PID || env.LISTEN_FDNAMES) {
    if (platform !== 'linux' || env.LISTEN_FDS !== '1' || env.LISTEN_PID !== String(pid) || env.LISTEN_FDNAMES !== 'smena-http')
      throw new Error('Invalid Smena socket activation contract.');
    return { fd: 3 };
  }
  return { port: Number(env.PORT || 3001), host: '127.0.0.1' };
}
