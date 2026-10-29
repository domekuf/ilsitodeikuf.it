import site from '~/content/site.json';
import type { brandColors } from '~/components/ui/icons';

export type SocialId = keyof typeof brandColors;
export type NavItem = { label: string; href: string; note?: string; modal?: string };
export type SocialLink = { id: SocialId; label: string; url: string };

export const SITE = site as {
  name: string;
  claim: string;
  email: string;
  /** token di Cloudflare Web Analytics; vuoto = disattivato */
  analyticsToken: string;
  nav: NavItem[];
  social: SocialLink[];
  facts: string[];
};

/** Path pulito: in build (format "file") Astro.url.pathname può essere /index.html o /concerti.html. */
export function cleanPath(pathname: string): string {
  return pathname.replace(/(\/index)?\.html$/, '').replace(/\/+$/, '') || '/';
}

/** Voce di menu attiva: corrispondenza esatta per la home, per prefisso per il resto. */
export function isActive(href: string, pathname: string): boolean {
  const path = cleanPath(pathname);
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}
