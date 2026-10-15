import { S } from './store.js';
import { isRussian } from './i18n.js';

const SCRIPT_ID = 'google-identity-services';
const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let scriptPromise;
let initializedClientId = '';
let resizeObserver;

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(window.google), { once: true });
    script.addEventListener('error', () => reject(new Error('Google sign-in is temporarily unavailable.')), { once: true });
  });
  return scriptPromise;
}

function buttonWidth(container) {
  return Math.max(200, Math.min(380, Math.floor(container.getBoundingClientRect().width)));
}

function renderButton(container, google) {
  if (!container.isConnected || !google?.accounts?.id) return;
  const width = buttonWidth(container);
  if (container.dataset.googleButtonWidth === String(width) && container.childElementCount) return;
  container.replaceChildren();
  container.dataset.googleButtonWidth = String(width);
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    locale: isRussian() ? 'ru' : 'en',
    width,
  });
}

export async function mountGoogleSignIn() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  const container = document.getElementById('google-signin');
  const config = S.ui.authConfig;
  if (!container || !config?.googleAuthEnabled || !config.googleClientId) return;

  try {
    const google = await loadGoogleIdentityServices();
    if (!container.isConnected) return;
    if (initializedClientId !== config.googleClientId) {
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: response => {
          if (response?.credential) {
            window.dispatchEvent(new CustomEvent('smena:google-credential', { detail: { credential: response.credential } }));
          }
        },
      });
      initializedClientId = config.googleClientId;
    }
    renderButton(container, google);
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => renderButton(container, google));
      resizeObserver.observe(container);
    }
  } catch (error) {
    if (container.isConnected) {
      container.innerHTML = `<span class="google-signin-error">${error.message}</span>`;
    }
  }
}
