import { authShell, ferr, icls } from './auth.js';
import { S } from '../core/store.js';
import { esc } from '../core/utils.js';
import { ic, LOGO } from '../core/icons.js';
import { strengthMeter } from '../ui/strength-meter.js';
export const socialBtns = () => `<div class="social">
  <button class="btn btn-secondary btn-lg" data-a="socialAuth" data-v="Google"><svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
  <button class="btn btn-secondary btn-lg" data-a="socialAuth" data-v="Microsoft"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect width="6.4" height="6.4" fill="#F25022"/><rect x="7.6" width="6.4" height="6.4" fill="#7FBA00"/><rect y="7.6" width="6.4" height="6.4" fill="#00A4EF"/><rect x="7.6" y="7.6" width="6.4" height="6.4" fill="#FFB900"/></svg>Continue with Microsoft</button>
  <button class="btn btn-secondary btn-lg" data-a="socialAuth" data-v="Apple">${ic('apple', 15)}Continue with Apple</button></div>`;

export function renderSecondaryAuth() {
  const s = S.ui.auth;
  const f = S.ui.af || (S.ui.af = { email: 'hello@example.com', name: '' });
  if (s === 'signup')
    return authShell(
      `<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doSignup" novalidate>
    <div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>Create your account</h1><p class="sub">Free for up to 3 members. No credit card required.</p>
    ${socialBtns()}<div class="or">or sign up with email</div>
    <div class="field"><label class="label" for="s-name">Full name</label><input class="input input-lg ${icls('name')}" id="s-name" value="${esc(f.name)}" autocomplete="name" placeholder="Tanjim Islam">${ferr('name')}</div>
    <div class="field"><label class="label" for="s-email">Work email</label><input class="input input-lg ${icls('email')}" id="s-email" type="email" value="" autocomplete="email" placeholder="you@company.com">${ferr('email')}</div>
    <div class="field"><label class="label" for="s-pw">Password</label><input class="input input-lg ${icls('pw')}" id="s-pw" type="password" data-in="pwStrength" value="${esc(S.ui.pwNew || '')}" autocomplete="new-password">${strengthMeter(S.ui.pwNew || '')}${ferr('pw') || '<span class="hint">At least 10 characters with a number or symbol.</span>'}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doSignup" id="signup-btn">Create account</button>
    <p class="hint" style="text-align:center">By creating an account you agree to the Terms and Privacy Policy.</p>
    <p class="auth-foot">Already have an account? <button type="button" class="link" data-a="auth" data-v="login">Sign in</button></p></form>`,
      `<button class="btn btn-ghost btn-sm" data-a="auth" data-v="login">Log in</button>`,
    );
  if (s === 'forgot')
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doForgot" novalidate>
    <div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('key-round', 20)}</span></div><h1>Reset your password</h1><p class="sub">Enter your account email and we'll send you a reset link.</p>
    <div class="field"><label class="label" for="f-email">Email</label><input class="input input-lg ${icls('email')}" id="f-email" type="email" value="${esc(f.email)}" autocomplete="email">${ferr('email')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doForgot" id="forgot-btn">Send reset link</button>
    <p class="auth-foot"><button type="button" class="link row" style="display:inline-flex;gap:6px" data-a="auth" data-v="login">${ic('arrow-left', 14)}Back to sign in</button></p></form>`);
  if (s === 'forgot-sent')
    return authShell(`<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--green);width:44px;height:44px;border-radius:11px">${ic('mail-check', 20)}</span></div><h1>Check your email</h1><p class="sub">We sent a reset link to <b style="color:var(--text)">${esc(f.email)}</b>. It expires in 30 minutes.</p>
    <button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="reset">Open reset link</button><div class="alert info">${ic('info', 14)}<span>In this prototype, the button above stands in for the link in your email.</span></div>
    <p class="auth-foot">Didn't get it? <button class="link" data-a="resend" data-v="reset">Resend email</button></p><p class="auth-foot"><button class="link row" style="display:inline-flex;gap:6px" data-a="auth" data-v="login">${ic('arrow-left', 14)}Back to sign in</button></p></div>`);
  if (s === 'reset')
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doReset" novalidate><div style="display:flex;justify-content:center">${LOGO(30)}</div><h1>Choose a new password</h1><p class="sub">for ${esc(f.email)}</p>
    <div class="field"><label class="label" for="r-pw">New password</label><input class="input input-lg ${icls('pw')}" id="r-pw" type="password" data-in="pwStrength" value="${esc(S.ui.pwNew || '')}" autocomplete="new-password">${strengthMeter(S.ui.pwNew || '')}${ferr('pw')}</div>
    <div class="field"><label class="label" for="r-pw2">Confirm password</label><input class="input input-lg ${icls('pw2')}" id="r-pw2" type="password" autocomplete="new-password">${ferr('pw2')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doReset" id="reset-btn">Reset password</button></form>`);
  if (s === 'reset-done')
    return authShell(
      `<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--green);width:44px;height:44px;border-radius:11px">${ic('circle-check', 20)}</span></div><h1>Password updated</h1><p class="sub">You can now sign in with your new password.</p><button class="btn btn-primary btn-lg btn-block" data-a="auth" data-v="login">Sign in</button></div>`,
    );
  if (s === 'verify')
    return authShell(`<div class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}"><div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('mail', 20)}</span></div><h1>Verify your email</h1><p class="sub">We sent a verification link to <b style="color:var(--text)">${esc(f.email)}</b>. Click it to activate your account.</p>
    <div class="panel" style="padding:12px 14px;display:flex;gap:10px;align-items:center"><span class="sk" style="width:8px;height:8px;border-radius:50%;animation-duration:1.1s"></span><span class="muted" style="font-size:13px">Waiting for verification…</span></div>
    <button class="btn btn-primary btn-lg btn-block" data-a="verified">I've verified my email</button>
    <button class="btn btn-secondary btn-lg btn-block" data-a="resend" data-v="verify" id="resend-btn" ${S.ui.resendT > 0 ? 'disabled' : ''}>${S.ui.resendT > 0 ? `Resend email in <span class="num" id="resend-t">${S.ui.resendT}</span>s` : 'Resend email'}</button>
    <p class="auth-foot">Wrong email? <button class="link" data-a="auth" data-v="signup">Change it</button></p></div>`);
  return '';
}
