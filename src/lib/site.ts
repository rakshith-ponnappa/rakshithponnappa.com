import { execSync } from 'node:child_process';

export const nav = [
  { href: '/work/', label: 'Work' },
  { href: '/projects/', label: 'Projects' },
  { href: '/experience/', label: 'Experience' },
  { href: '/ask/', label: 'Ask' },
  { href: '/resume/', label: 'Résumé' },
] as const;

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

export const build = {
  time: new Date(),
  sha: process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) || process.env.GITHUB_SHA?.slice(0, 7) || gitSha(),
};

export const isActive = (path: string, href: string) =>
  href === '/' ? path === '/' : path.replace(/\/?$/, '/').startsWith(href);
