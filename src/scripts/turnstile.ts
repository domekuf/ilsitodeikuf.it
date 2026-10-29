// Turnstile lato client: render esplicito, caricato al primo focus su un form.
// Con le chiavi di test non si carica niente: si usa il token finto che il server accetta solo
// con il secret di test (src/lib/turnstile.ts).
import { DUMMY_TOKEN, isTestSiteKey } from '~/lib/turnstile';

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  getResponse(id: string): string | undefined;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;
const widgets = new WeakMap<
  HTMLElement,
  { id: string; token: Promise<string>; resolve: (t: string) => void }
>();

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function deferred() {
  let resolve!: (t: string) => void;
  const token = new Promise<string>((r) => (resolve = r));
  return { token, resolve };
}

function hiddenInput(box: HTMLElement): HTMLInputElement {
  let input = box.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'cf-turnstile-response';
    box.appendChild(input);
  }
  return input;
}

/** Prepara il widget del form (idempotente). */
export async function prepare(form: HTMLFormElement): Promise<void> {
  const box = form.querySelector<HTMLElement>('[data-turnstile]');
  if (!box || widgets.has(box)) return;
  const sitekey = box.dataset['sitekey'] ?? '';
  const d = deferred();
  if (isTestSiteKey(sitekey)) {
    hiddenInput(box).value = DUMMY_TOKEN;
    widgets.set(box, { id: 'test', ...d });
    d.resolve(DUMMY_TOKEN);
    return;
  }
  widgets.set(box, { id: '', ...d });
  const api = await load();
  const id = api.render(box, {
    sitekey,
    appearance: 'interaction-only',
    language: 'it',
    size: 'flexible',
    callback: (t: string) => widgets.get(box)?.resolve(t),
  });
  const w = widgets.get(box);
  if (w) w.id = id;
}

/** Token pronto per l'invio (aspetta il widget, al massimo 20 secondi). */
export async function token(form: HTMLFormElement): Promise<string | null> {
  await prepare(form).catch(() => undefined);
  const box = form.querySelector<HTMLElement>('[data-turnstile]');
  const w = box ? widgets.get(box) : undefined;
  if (!w) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000));
  return Promise.race([w.token, timeout]);
}

/** I token valgono una volta sola: dopo ogni invio ne serve uno nuovo. */
export function reset(form: HTMLFormElement): void {
  const box = form.querySelector<HTMLElement>('[data-turnstile]');
  const w = box ? widgets.get(box) : undefined;
  if (!box || !w) return;
  if (w.id === 'test') return; // il token finto resta valido
  const d = deferred();
  widgets.set(box, { id: w.id, ...d });
  window.turnstile?.reset(w.id);
}
