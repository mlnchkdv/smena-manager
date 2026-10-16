export function strengthMeter(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const color = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'][score];
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return password
    ? `<div class="row" style="gap:8px"><div class="strength grow" aria-hidden="true">${[0, 1, 2, 3].map(index => `<i class="${index < score ? 'on' : ''}" style="--c:${color}"></i>`).join('')}</div><span style="font-size:11.5px;color:${color};width:60px;text-align:right">${label}</span></div>`
    : '';
}
