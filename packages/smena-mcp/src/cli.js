#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readCredential, credentialOperation } from './credentials.js';
import { SmenaApiClient } from './client.js';
import { createMcpServer } from './server.js';

async function secretInput() {
  if (!process.stdin.isTTY) {
    let text = '';
    for await (const chunk of process.stdin) {
      text += chunk;
      if (text.length > 512) throw new Error('Invalid token input.');
    }
    return text.trim();
  }
  process.stderr.write('Paste integration token (hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', input);
      process.stderr.write('\n');
    };
    const input = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          resolve(value.trim());
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (value.length < 512) value += char;
      }
    };
    process.stdin.on('data', input);
  });
}
async function main() {
  const args = process.argv.slice(2),
    command = args.shift() || 'serve';
  let origin = 'https://smena.team',
    profile = 'default';
  while (args.length) {
    const key = args.shift(),
      value = args.shift();
    if (key === '--origin') origin = value;
    else if (key === '--profile') profile = value;
    else throw new Error('Unknown option. Use serve, auth-login, auth-logout or doctor with --origin and --profile.');
  }
  if (command === 'auth-logout') {
    credentialOperation('delete', profile);
    process.stderr.write('Credential removed.\n');
    return;
  }
  if (command === 'auth-login') {
    const token = await secretInput();
    await new SmenaApiClient({ origin, token }).call('GET', '/me');
    credentialOperation('write', profile, token);
    process.stderr.write('Credential saved in the system secret store.\n');
    return;
  }
  const client = new SmenaApiClient({ origin, token: readCredential(profile) });
  if (command === 'doctor') {
    const context = await client.call('GET', '/me');
    process.stderr.write(JSON.stringify({ workspace: context.workspace, scopes: context.scopes }) + '\n');
    return;
  }
  if (command !== 'serve') throw new Error('Unknown command.');
  const server = createMcpServer(client);
  await server.connect(new StdioServerTransport());
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      void server.close().finally(() => process.exit(0));
    });
}
main().catch(() => {
  process.stderr.write('Smena MCP could not start. Check the origin, profile and system credential store; run auth-login or doctor.\n');
  process.exitCode = 1;
});
