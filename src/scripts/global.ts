import { toast, toggleTheme, uptimeParts } from './ui';

const root = document.documentElement;

// Platform-aware shortcut labels.
if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  document.querySelectorAll('[data-mod]').forEach((k) => (k.textContent = (k.textContent ?? '').replace('⌘', 'Ctrl ')));
}

document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) =>
  b.addEventListener('click', (e) => toggleTheme({ x: e.clientX, y: e.clientY })),
);

// Pointer-follow glow for .glow cards (one delegated listener, rAF-throttled).
let raf = 0;
document.addEventListener(
  'pointermove',
  (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const card = (e.target as HTMLElement).closest?.<HTMLElement>('.glow');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  },
  { passive: true },
);

// Copy-to-clipboard buttons: <button data-copy="text">.
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
  if (!btn) return;
  navigator.clipboard?.writeText(btn.dataset.copy!).then(() => {
    toast(`Copied ${btn.dataset.copy}`);
    btn.dataset.copied = '';
    setTimeout(() => delete btn.dataset.copied, 1600);
  });
});

// Live uptime counters: <span data-uptime="2014-08-01">.
const counters = document.querySelectorAll<HTMLElement>('[data-uptime]');
if (counters.length) {
  const tick = () =>
    counters.forEach((el) => {
      const u = uptimeParts(el.dataset.uptime!);
      const set = (k: string, v: string | number) => {
        const t = el.querySelector(`[data-u="${k}"]`);
        if (t && t.textContent !== String(v)) t.textContent = String(v);
      };
      set('y', u.y);
      set('m', String(u.m).padStart(2, '0'));
      set('d', String(u.d).padStart(2, '0'));
      set('hms', u.hms);
    });
  tick();
  setInterval(tick, 1000);
}

// Local clock: <time data-clock data-tz="Asia/Kolkata">.
document.querySelectorAll<HTMLElement>('[data-clock]').forEach((el) => {
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: el.dataset.tz });
  const tick = () => (el.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 15_000);
});

// Konami code → chaos monkey.
const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let pos = 0;
document.addEventListener('keydown', (e) => {
  pos = e.key === seq[pos] ? pos + 1 : e.key === seq[0] ? 1 : 0;
  if (pos < seq.length) return;
  pos = 0;
  root.dataset.chaos = '';
  toast('chaos-monkey: terminated pod portfolio-7f9c4… rescheduling', 'warn');
  setTimeout(() => {
    delete root.dataset.chaos;
    toast('portfolio-7f9c4 → Running · self-healed. Resilience is a feature.');
  }, 1300);
});
