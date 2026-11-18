// Small shared UI helpers. Everything here is progressive: the site works without it.

export function toast(message: string, tone: 'ok' | 'warn' = 'ok') {
  let region = document.querySelector<HTMLDivElement>('[data-toasts]');
  if (!region) {
    region = document.createElement('div');
    region.dataset.toasts = '';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.className = 'toasts';
    document.body.append(region);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${tone}`;
  t.textContent = message;
  region.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('theme', theme);
  } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f9f8f4' : '#0d1117');
}

// Theme switch as a circular reveal from the pointer, using the View Transitions API.
export function toggleTheme(origin?: { x: number; y: number }) {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  toast(next === 'light' ? 'shift change: NOC → Day shift' : 'shift change: Day shift → NOC');
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || reduced()) return setTheme(next);
  const x = origin?.x ?? innerWidth - 40;
  const y = origin?.y ?? 32;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.dataset.vt = 'theme';
  const vt = doc.startViewTransition(() => setTheme(next));
  // WebKit can defer the update callback (busy or throttled page); the toggle must never look dead, so apply
  // the theme directly if it hasn't landed shortly after the click. setTheme is idempotent.
  setTimeout(() => {
    if (document.documentElement.dataset.theme === next) return;
    (vt as unknown as { skipTransition?: () => void }).skipTransition?.();
    setTheme(next);
  }, 400);
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
  (vt as unknown as { finished: Promise<void> }).finished?.finally(() => delete document.documentElement.dataset.vt);
}

// Career "uptime", measured in IST from the first day at Capgemini.
export function uptimeParts(since: string, now = new Date()) {
  const [sy, sm, sd] = since.split('-').map(Number);
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  let y = ist.getUTCFullYear() - sy;
  let m = ist.getUTCMonth() + 1 - sm;
  let d = ist.getUTCDate() - sd;
  if (d < 0) {
    m -= 1;
    d += new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 0)).getUTCDate();
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return { y, m, d, hms: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}` };
}

export function uptimeString(since: string) {
  const u = uptimeParts(since);
  return `${u.y} years, ${u.m} months, ${u.d} days`;
}
