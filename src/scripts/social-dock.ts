// Comportamento del FAB dei social (§6.4).
const MOBILE = '(max-width: 767.98px)';
const PULSE_KEY = 'kuf-dock-pulse';
const SEEN_KEY = 'kuf-dock-seen';

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function initSocialDock(): void {
  const dock = document.querySelector<HTMLElement>('[data-dock]');
  const toggle = dock?.querySelector<HTMLButtonElement>('[data-dock-toggle]');
  if (!dock || !toggle) return;

  const isMobile = () => window.matchMedia(MOBILE).matches;

  const setOpen = (open: boolean) => {
    dock.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => {
    setOpen(!dock.hasAttribute('data-open'));
    dock.classList.remove('dock--pulse');
  });

  // chiude al tap fuori, su Esc e quando si segue un link
  document.addEventListener('pointerdown', (e) => {
    if (dock.hasAttribute('data-open') && !dock.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dock.hasAttribute('data-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  dock.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));

  // su mobile si nasconde mentre si scrive in un form, per non coprire la tastiera
  const isField = (el: EventTarget | null) =>
    el instanceof HTMLElement && el.matches('input:not([type=checkbox]):not([type=radio]), textarea, select');
  document.addEventListener('focusin', (e) => {
    if (isMobile() && isField(e.target)) {
      setOpen(false);
      dock.classList.add('dock--hidden');
    }
  });
  document.addEventListener('focusout', (e) => {
    if (isField(e.target)) dock.classList.remove('dock--hidden');
  });

  // l'ingresso animato su desktop si vede una volta per sessione
  storage('session')?.setItem(SEEN_KEY, '1');

  // piccolo pulse alla prima visita (mai con reduced-motion)
  const local = storage('local');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && isMobile() && local && !local.getItem(PULSE_KEY)) {
    window.setTimeout(() => {
      dock.classList.add('dock--pulse');
      local.setItem(PULSE_KEY, '1');
    }, 2000);
  }
}
