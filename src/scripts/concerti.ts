// Interazioni del dettaglio concerto (§7.3). Il contenuto della modale cambia (innerHTML dal router),
// quindi tutto passa da listener sul document.
//
// - Foto della venue: alla prima apertura della modale si chiede /api/venue-photos; la galleria
//   (nascosta) si mostra solo se Google ha delle foto. Le `foto:` della descrizione sono già nell'HTML.
// - "Mostra la mappa": l'iframe di Google Maps si carica solo al clic (facade).
// - "Condividi": Web Share API, altrimenti copia il link.

type Photo = {
  url: string;
  width?: number;
  height?: number;
  attributions: { name: string; uri?: string }[];
};
type Payload = { source: 'google' | 'override' | 'none'; photos: Photo[] };

const loaded = new WeakSet<HTMLElement>();

function credits(photos: Photo[], source: Payload['source']): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (source !== 'google') return frag;
  const seen = new Map<string, string | undefined>();
  photos.flatMap((p) => p.attributions).forEach((a) => seen.set(a.name, a.uri));
  frag.append('Foto: ');
  [...seen].forEach(([name, uri], i) => {
    if (i > 0) frag.append(', ');
    if (uri) {
      const a = document.createElement('a');
      a.href = uri;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = name;
      frag.appendChild(a);
    } else {
      frag.append(name);
    }
  });
  frag.append(seen.size ? ' via Google Maps' : 'Google Maps');
  return frag;
}

async function loadGallery(gallery: HTMLElement) {
  if (loaded.has(gallery) || !gallery.hasAttribute('data-pending')) return;
  loaded.add(gallery);
  const slug = gallery.dataset['slug'];
  if (!slug) return;
  try {
    const res = await fetch(`/api/venue-photos?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = (await res.json()) as Payload;
    if (data.source === 'none' || data.photos.length === 0) return;

    const items = [...gallery.querySelectorAll<HTMLLIElement>('.venue-gallery__item')];
    const venue = gallery.dataset['venue'] ?? '';
    items.forEach((li, i) => {
      const photo = data.photos[i];
      const img = li.querySelector('img');
      if (!photo || !img) {
        li.remove();
        return;
      }
      img.src = photo.url;
      img.alt = `${venue}: foto ${i + 1}`;
      if (photo.width && photo.height) {
        img.width = photo.width;
        img.height = photo.height;
      }
    });
    const caption = gallery.querySelector<HTMLElement>('[data-credits]');
    if (caption) caption.replaceChildren(credits(data.photos, data.source));
    gallery.dataset['source'] = data.source;
    gallery.removeAttribute('data-pending');
    gallery.hidden = false;
  } catch {
    // niente foto: la galleria resta nascosta
  }
}

function loadGalleriesIn(root: Element) {
  root.querySelectorAll<HTMLElement>('[data-venue-gallery]').forEach((g) => void loadGallery(g));
}

function showMap(button: HTMLButtonElement) {
  const slot = document.getElementById(button.getAttribute('aria-controls') ?? '');
  const src = button.dataset['mapFacade'];
  if (!slot || !src) return;
  if (!slot.querySelector('iframe')) {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = 'Mappa del posto';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.allowFullscreen = true;
    slot.appendChild(iframe);
  }
  slot.hidden = false;
  button.hidden = true;
}

async function share(button: HTMLButtonElement) {
  const url = button.dataset['shareUrl'] ?? location.href;
  const title = button.dataset['shareTitle'] ?? document.title;
  const label = button.querySelector<HTMLElement>('[data-share-label]') ?? button;
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      // annullato dall'utente: niente
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    label.textContent = 'Link copiato';
  } catch {
    label.textContent = 'Copia il link dalla barra';
  }
  setTimeout(() => (label.textContent = 'Condividi'), 2500);
}

export function initConcerti(): void {
  document.addEventListener('kuf:modal-open', (e) => loadGalleriesIn(e.target as Element));
  // accesso diretto: la modale è già aperta (anche se il router l'ha già resa modale prima di noi)
  document.querySelectorAll<HTMLDialogElement>('dialog[data-modal][open]').forEach((d) => loadGalleriesIn(d));

  document.addEventListener('click', (e) => {
    const target = e.target as Element;
    const mapButton = target.closest<HTMLButtonElement>('button[data-map-facade]');
    if (mapButton) return showMap(mapButton);
    const shareButton = target.closest<HTMLButtonElement>('button[data-share]');
    if (shareButton) void share(shareButton);
  });
}
