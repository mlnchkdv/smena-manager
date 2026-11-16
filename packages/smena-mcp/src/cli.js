#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readCredential, credentialOperation, readClipboardToken } from './credentials.js';
import { SmenaApiClient } from './client.js';
import { createMcpServer } from './server.js';
import { OperationJournal } from './operations.js';

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
  let clipboardLogin = false,
    browserLogin = false;
  const uploadOptions = {};
  while (args.length) {
    const key = args.shift();
    if (key === '--clipboard') {
      clipboardLogin = true;
      continue;
    }
    if (key === '--browser') {
      browserLogin = true;
      continue;
    }
    const value = args.shift();
    if (key === '--origin') origin = value;
    else if (key === '--profile') profile = value;
    else if (['--file', '--workspace', '--project', '--folder', '--operation-id', '--mime-type'].includes(key)) uploadOptions[key] = value;
    else throw new Error('Unknown option. Use serve, auth-login, auth-logout or doctor with --origin and --profile.');
  }
  if (command === 'auth-logout') {
    credentialOperation('delete', profile);
    process.stderr.write('Credential removed.\n');
    return;
  }
  if (command === 'auth-login') {
    if (browserLogin) {
      const { startBrowserLogin } = await import('./browser-login.js');
      const setup = await startBrowserLogin({
        save: async token => {
          await new SmenaApiClient({ origin, token }).call('GET', '/me');
          credentialOperation('write', profile, token);
        },
      });
      process.stderr.write('Open this one-time local setup page (expires in 5 minutes):\n' + setup.url + '\n');
      await setup.done;
      process.stderr.write('Credential saved in the system secret store.\n');
      return;
    }
    const token = clipboardLogin ? readClipboardToken() : await secretInput();
    await new SmenaApiClient({ origin, token }).call('GET', '/me');
    credentialOperation('write', profile, token);
    process.stderr.write('Credential saved in the system secret store.\n');
    return;
  }
  const client = new SmenaApiClient({ origin, token: readCredential(profile) });
  if (command === 'upload-local') {
    const { uploadLocalFile } = await import('./upload.js');
    const result = await uploadLocalFile({
      client,
      journal: new OperationJournal({ profile }),
      file: uploadOptions['--file'],
      workspaceId: uploadOptions['--workspace'],
      projectId: uploadOptions['--project'],
      folderId: uploadOptions['--folder'] || null,
      operationId: uploadOptions['--operation-id'],
      mimeType: uploadOptions['--mime-type'] || 'application/octet-stream',
      onProgress: (done, total) => process.stderr.write(`Upload ${Math.floor((done / total) * 100)}%\n`),
    });
    process.stderr.write(JSON.stringify(result) + '\n');
    return;
  }
  if (command === 'doctor') {
    const context = await client.call('GET', '/me');
    process.stderr.write(JSON.stringify({ workspace: context.workspace, scopes: context.scopes }) + '\n');
    return;
  }
  if (command !== 'serve') throw new Error('Unknown command.');
  const server = createMcpServer(client, new OperationJournal({ profile }));
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
