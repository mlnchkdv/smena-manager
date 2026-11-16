import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tokenPattern = /^smena_int_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/;
export function readClipboardToken() {
  if (process.platform !== 'win32') throw new Error('Clipboard login is supported on Windows; use the hidden prompt on other platforms.');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::Out.Write((Get-Clipboard -Raw))'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4096,
  });
  const value = String(result.stdout || '').trim();
  if (result.error || result.status !== 0 || !tokenPattern.test(value)) throw new Error('The clipboard does not contain a Smena integration token.');
  return value;
}
export function credentialOperation(operation, profile, token = '', platform = process.platform) {
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(profile)) throw new Error('Invalid credential profile.');
  if (operation === 'write' && !tokenPattern.test(token)) throw new Error('Invalid integration token.');
  let command, args, input;
  if (platform === 'win32') {
    command = 'powershell.exe';
    args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      fileURLToPath(new URL('./credential-helper.ps1', import.meta.url)),
      '-Operation',
      operation,
      '-ProfileName',
      profile,
    ];
    input = token;
  } else if (platform === 'darwin') {
    command = 'security';
    if (operation === 'read') args = ['find-generic-password', '-s', 'SmenaMCP/' + profile, '-a', 'Smena', '-w'];
    else if (operation === 'delete') args = ['delete-generic-password', '-s', 'SmenaMCP/' + profile, '-a', 'Smena'];
    else {
      args = ['-q', '-i'];
      input = `add-generic-password -U -s "SmenaMCP/${profile}" -a Smena -w "${token}"\n`;
    }
  } else {
    command = 'secret-tool';
    args = [
      operation === 'read' ? 'lookup' : operation === 'delete' ? 'clear' : 'store',
      ...(operation === 'write' ? ['--label=Smena MCP'] : []),
      'service',
      'SmenaMCP',
      'profile',
      profile,
    ];
    input = token;
  }
  const result = spawnSync(command, args, { input, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) {
    if (operation === 'delete' && !result.error) return '';
    throw new Error(
      'System credential store is unavailable or the profile is missing. Run auth-login, or explicitly provide SMENA_INTEGRATION_TOKEN in the process environment.',
    );
  }
  const value = String(result.stdout || '').trim();
  if (operation === 'read' && !tokenPattern.test(value)) throw new Error('The credential store returned an invalid token.');
  return operation === 'read' ? value : '';
}
export function readCredential(profile) {
  const temporary = process.env.SMENA_INTEGRATION_TOKEN;
  if (temporary) {
    if (!tokenPattern.test(temporary)) throw new Error('Invalid temporary integration token.');
    return temporary;
  }
  return credentialOperation('read', profile);
}
