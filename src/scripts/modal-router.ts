// Modali con URL (§6.1). Un solo pattern per concerti, articoli e Contattaci.
//
// Link:   <a href="/concerti/2017-11-17-almagia" data-modal-link="concerto">
// Modale: <dialog id="concerto" data-modal data-list-url="/concerti">…<div data-modal-content>…</div></dialog>
//
// - Apertura da link: il contenuto arriva da <template data-modal-template="{href}"> già nella pagina,
//   oppure dal fetch della pagina di dettaglio (si prende il [data-modal-content] della stessa modale).
//   Poi showModal() + pushState sull'URL di dettaglio + document.title aggiornato.
// - Accesso diretto: il server manda la modale già aperta (data-open-on-load); qui la rendiamo modale vera.
// - Chiusura (X, Esc, click sul backdrop): history.back() se l'abbiamo aperta noi con pushState,
//   altrimenti replaceState verso l'URL della lista.
// - Indietro/avanti del browser (popstate) aprono e chiudono le modali in modo coerente.
// - Se qualcosa va storto, si naviga normalmente all'URL: il sito funziona comunque.

type ModalState = { kufModal: string; pushed: boolean; listUrl: string };

type Entry = { html: string; title: string };

const cache = new Map<string, Entry>();
const openers = new WeakMap<HTMLDialogElement, HTMLElement | null>();
const baseTitles = new WeakMap<HTMLDialogElement, string>();

const isModalState = (s: unknown): s is ModalState =>
  typeof s === 'object' && s !== null && typeof (s as ModalState).kufModal === 'string';

const getDialog = (id: string) => {
  const el = document.getElementById(id);
  return el instanceof HTMLDialogElement && el.hasAttribute('data-modal') ? el : null;
};

const contentOf = (dialog: HTMLDialogElement) =>
  dialog.querySelector<HTMLElement>('[data-modal-content]') ?? dialog;

function currentPath(): string {
  return location.pathname + location.search;
}

function show(dialog: HTMLDialogElement, opener: HTMLElement | null) {
  if (dialog.open && dialog.matches(':modal')) return;
  if (dialog.open) dialog.close(); // aperta "non modale" dall'HTML del server
  openers.set(dialog, opener);
  dialog.showModal();
  // per chi vuole caricare qualcosa solo a modale aperta (es. le foto delle venue)
  dialog.dispatchEvent(new CustomEvent('kuf:modal-open', { bubbles: true }));
  // il focus va sul titolo, così lo screen reader legge subito di cosa si tratta
  const title = dialog.querySelector<HTMLElement>(`#${CSS.escape(dialog.id)}-title`);
  if (title) {
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
}

function hide(dialog: HTMLDialogElement) {
  if (!dialog.open) return;
  dialog.close();
  const base = baseTitles.get(dialog);
  if (base) document.title = base;
  const opener = openers.get(dialog);
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  openers.delete(dialog);
}

async function load(dialog: HTMLDialogElement, url: string): Promise<Entry | null> {
  if (dialog.hasAttribute('data-modal-inline')) return null;
  const cached = cache.get(url);
  if (cached) return cached;

  const tpl = document.querySelector<HTMLTemplateElement>(
    `template[data-modal-template="${CSS.escape(url)}"]`,
  );
  if (tpl) {
    const entry = { html: tpl.innerHTML, title: tpl.dataset['title'] ?? document.title };
    cache.set(url, entry);
    return entry;
  }

  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const remote = doc.querySelector(`#${CSS.escape(dialog.id)} [data-modal-content]`);
  if (!remote) throw new Error('contenuto della modale non trovato');
  const entry = { html: remote.innerHTML, title: doc.title };
  cache.set(url, entry);
  return entry;
}

function render(dialog: HTMLDialogElement, entry: Entry | null) {
  if (!baseTitles.has(dialog)) baseTitles.set(dialog, document.title);
  if (!entry) {
    const title = dialog.dataset['modalTitle'];
    if (title) document.title = title;
    return;
  }
  contentOf(dialog).innerHTML = entry.html;
  document.title = entry.title;
}

async function openFromLink(link: HTMLAnchorElement) {
  const id = link.dataset['modalLink'];
  const dialog = id ? getDialog(id) : null;
  if (!dialog) return void (location.href = link.href);

  const url = new URL(link.href, location.href);
  const target = url.pathname + url.search;
  const listUrl = dialog.dataset['listUrl'] ?? currentPath();
  if (!baseTitles.has(dialog) && !dialog.open) baseTitles.set(dialog, document.title);

  try {
    dialog.setAttribute('aria-busy', 'true');
    const entry = await load(dialog, target);
    render(dialog, entry);
  } catch {
    location.href = link.href; // fallback: navigazione normale
    return;
  } finally {
    dialog.removeAttribute('aria-busy');
  }

  const state: ModalState = { kufModal: dialog.id, pushed: true, listUrl };
  if (target !== currentPath()) history.pushState(state, '', target);
  else history.replaceState(state, '');
  show(dialog, link);
}

function requestClose(dialog: HTMLDialogElement) {
  const state = history.state as unknown;
  if (isModalState(state) && state.kufModal === dialog.id && state.pushed) {
    history.back(); // popstate chiuderà la modale
    return;
  }
  const listUrl = isModalState(state) ? state.listUrl : (dialog.dataset['listUrl'] ?? '/');
  history.replaceState(null, '', listUrl);
  // all'accesso diretto il titolo "base" è quello del dettaglio: chiudendo vale quello della lista
  const listTitle = dialog.dataset['listTitle'];
  if (listTitle) baseTitles.set(dialog, listTitle);
  hide(dialog);
}

async function onPopState(event: PopStateEvent) {
  const state = event.state as unknown;
  const openDialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[data-modal][open]')];

  if (isModalState(state)) {
    const dialog = getDialog(state.kufModal);
    if (!dialog) return;
    openDialogs.filter((d) => d !== dialog).forEach(hide);
    try {
      render(dialog, await load(dialog, currentPath()));
      show(dialog, openers.get(dialog) ?? null);
    } catch {
      location.reload();
    }
  } else {
    openDialogs.forEach(hide);
  }
}

function wireDialog(dialog: HTMLDialogElement) {
  // Esc
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClose(dialog);
  });
  // click sul backdrop (il target è il <dialog> stesso, fuori dal pannello)
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) requestClose(dialog);
  });
  dialog.addEventListener('click', (e) => {
    const close = (e.target as Element).closest('[data-modal-close]');
    if (close && dialog.contains(close)) {
      e.preventDefault();
      requestClose(dialog);
    }
  });

  // accesso diretto: la modale arriva già aperta dal server
  if (dialog.hasAttribute('data-open-on-load')) {
    const listUrl = dialog.dataset['listUrl'] ?? '/';
    history.replaceState({ kufModal: dialog.id, pushed: false, listUrl } satisfies ModalState, '');
    baseTitles.set(dialog, document.title);
    show(dialog, null);
  }
}

export function initModalRouter(): void {
  document.querySelectorAll<HTMLDialogElement>('dialog[data-modal]').forEach(wireDialog);

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element).closest<HTMLAnchorElement>('a[data-modal-link]');
    if (!link || !link.dataset['modalLink'] || link.target === '_blank') return;
    if (!getDialog(link.dataset['modalLink'])) return; // nessuna modale in pagina: link normale
    e.preventDefault();
    void openFromLink(link);
  });

  window.addEventListener('popstate', (e) => void onPopState(e));
}
