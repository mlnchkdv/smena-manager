import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:53682/oauth2/callback';

export function gmailConsentConfig(env = process.env) {
  const clientId = String(env.GMAIL_OAUTH_CLIENT_ID || env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(env.GMAIL_OAUTH_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.GMAIL_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  const sender = String(env.EMAIL_FROM || 'avdeevandry1999@gmail.com')
    .trim()
    .toLowerCase();
  return { clientId, clientSecret, redirectUri, sender };
}

export function gmailConsentUrl(config, state) {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    login_hint: config.sender,
    prompt: 'consent select_account',
    scope: ['openid', 'email', GMAIL_SEND_SCOPE],
    state,
  });
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function callbackCode(config, expectedState) {
  const callback = new URL(config.redirectUri);
  if (callback.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(callback.hostname)) {
    throw new Error('GMAIL_OAUTH_REDIRECT_URI must use an http://127.0.0.1 or http://localhost callback.');
  }
  const port = Number(callback.port || 80);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error('Google consent timed out after 10 minutes. Run the command again.'));
      },
      10 * 60 * 1000,
    );
    const server = http.createServer((request, response) => {
      const url = new URL(request.url || '/', config.redirectUri);
      if (url.pathname !== callback.pathname) {
        response.writeHead(404).end('Not found');
        return;
      }
      const finish = (status, heading, message) => {
        clearTimeout(timeout);
        response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(
          `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${heading}</title><body style="font:16px system-ui;max-width:620px;margin:64px auto;padding:0 24px"><h1>${heading}</h1><p>${message}</p></body></html>`,
        );
        server.close();
      };
      if (url.searchParams.get('state') !== expectedState) {
        finish(400, 'Проверка не пройдена', 'Состояние OAuth не совпало. Закройте вкладку и запустите настройку заново.');
        reject(new Error('Google OAuth state mismatch.'));
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        finish(400, 'Доступ не предоставлен', 'Google не выдал разрешение. Можно закрыть эту вкладку.');
        reject(new Error(`Google OAuth failed: ${error}`));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        finish(400, 'Код не получен', 'Google не вернул код подтверждения.');
        reject(new Error('Google OAuth did not return an authorization code.'));
        return;
      }
      finish(200, 'Разрешение получено', 'Вернитесь в терминал Smena Manager — настройка будет завершена автоматически.');
      resolve(code);
    });
    server.on('error', reject);
    server.listen(port, callback.hostname);
  });
}

async function main() {
  const config = gmailConsentConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or their GMAIL_OAUTH_* equivalents) before running this command.');
  }
  const state = randomBytes(24).toString('base64url');
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  const codePromise = callbackCode(config, state);
  const authorizationUrl = gmailConsentUrl(config, state);
  console.log('\nGoogle Gmail consent is ready.');
  console.log(`Expected sender: ${config.sender}`);
  console.log(`Redirect URI: ${config.redirectUri}`);
  console.log('If the browser does not open, copy this URL:\n');
  console.log(authorizationUrl + '\n');
  if (!process.argv.includes('--no-open')) openBrowser(authorizationUrl);

  const code = await codePromise;
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('Google did not issue a refresh token. Revoke the app grant and retry with consent.');
  if (!tokens.id_token) throw new Error('Google did not return the account identity token.');
  if (!tokens.access_token) throw new Error('Google did not issue an access token for permission verification.');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
  const email = String(ticket.getPayload()?.email || '').toLowerCase();
  if (!email || email !== config.sender) {
    throw new Error(`The confirmed account ${email || '(unknown)'} does not match EMAIL_FROM ${config.sender}.`);
  }
  const tokenInfo = await client.getTokenInfo(tokens.access_token);
  if (!(tokenInfo.scopes || []).includes(GMAIL_SEND_SCOPE)) throw new Error('The required gmail.send permission was not granted.');

  const outputDir = path.resolve('.data');
  const outputPath = path.join(outputDir, 'gmail-oauth.env');
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `GMAIL_OAUTH_REFRESH_TOKEN=${JSON.stringify(tokens.refresh_token)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(outputPath, 0o600).catch(() => {});
  console.log(`Confirmed ${email}. The dedicated token was saved to ${outputPath}.`);
  console.log('Add its value to Vercel as GMAIL_OAUTH_REFRESH_TOKEN for Production, Preview, and Development, then redeploy.');
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch(error => {
    console.error(`\nGmail setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
