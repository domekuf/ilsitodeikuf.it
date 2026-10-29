// Invio dei form con le Astro Actions (§6.2, §6.3): validazione in italiano accanto ai campi,
// stati idle → invio → successo / errore, Turnstile.
import { actions, isInputError } from 'astro:actions';
import * as turnstile from './turnstile';

const MESSAGES = {
  valueMissing: 'Questo campo è obbligatorio.',
  typeMismatch: 'Quest’email non ci piace: controlla che ci sia la @.',
  tooLong: 'È un po’ troppo lungo.',
};
const FALLBACK = 'Qualcosa è andato storto. Riprova tra poco o scrivici a kuf.ravenna@gmail.com.';

type Field = HTMLInputElement | HTMLTextAreaElement;

function errorFor(field: Field): string | null {
  const v = field.validity;
  if (v.valid) return null;
  if (v.valueMissing) return MESSAGES.valueMissing;
  if (v.typeMismatch) return MESSAGES.typeMismatch;
  if (v.tooLong) return MESSAGES.tooLong;
  return field.validationMessage;
}

function showError(field: Field, message: string | null) {
  const errId = `${field.id}-error`;
  let el = document.getElementById(errId);
  if (!message) {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('p');
    el.id = errId;
    el.className = 'field__error';
    field.insertAdjacentElement('afterend', el);
  }
  el.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', errId);
}

function validate(form: HTMLFormElement): Field | null {
  let first: Field | null = null;
  for (const f of form.querySelectorAll<Field>('.field__control')) {
    const msg = errorFor(f);
    showError(f, msg);
    if (msg && !first) first = f;
  }
  return first;
}

function setBusy(form: HTMLFormElement, busy: boolean) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  const label = button.querySelector<HTMLElement>('[data-label]');
  if (label) label.textContent = busy ? 'Invio…' : (label.dataset['label'] ?? '');
}

function status(form: HTMLFormElement, text: string, tone: 'info' | 'error' | 'ok' = 'info') {
  const el = form.querySelector<HTMLElement>('[data-form-status]');
  if (!el) return;
  el.textContent = text;
  el.dataset['tone'] = tone;
}

async function submit(form: HTMLFormElement) {
  const invalid = validate(form);
  if (invalid) {
    invalid.focus();
    status(form, 'Controlla i campi segnati.', 'error');
    return;
  }
  const page = form.querySelector<HTMLInputElement>('input[name="page"]');
  if (page) page.value = location.pathname;

  setBusy(form, true);
  status(form, 'Invio in corso…');
  try {
    const human = await turnstile.token(form);
    if (!human) {
      status(form, 'La verifica anti-spam non è pronta. Aspetta un attimo e riprova.', 'error');
      return;
    }
    const data = new FormData(form);
    const kind = form.dataset['form'];
    const download = kind === 'download' ? await actions.richiestaDownload(data) : null;
    const result = download ?? (await actions.contatto(data));

    if (result.error) {
      if (isInputError(result.error)) {
        let first: Field | null = null;
        for (const [name, msgs] of Object.entries(result.error.fields)) {
          const field = form.querySelector<Field>(`[name="${CSS.escape(name)}"]`);
          if (field?.classList.contains('field__control')) {
            showError(field, (msgs as string[] | undefined)?.[0] ?? MESSAGES.valueMissing);
            first ??= field;
          }
        }
        first?.focus();
        status(form, 'Controlla i campi segnati.', 'error');
      } else {
        status(form, result.error.message || FALLBACK, 'error');
      }
      turnstile.reset(form);
      return;
    }

    if (download?.data) {
      const { name, url, filename } = download.data;
      status(
        form,
        `Grazie davvero, ${name}! Il download sta partendo. Ti abbiamo mandato anche il link per email.`,
        'ok',
      );
      const link = form.querySelector<HTMLAnchorElement>('[data-download-link]');
      if (link) {
        link.href = url;
        link.download = filename;
        link.hidden = false;
      }
      window.location.assign(url);
      form.reset();
      return;
    }
    // contatto: il form lascia il posto al messaggio di ringraziamento
    const done = form.parentElement?.querySelector<HTMLElement>('[data-form-done]');
    if (done && result.data) {
      done.querySelector('[data-done-text]')!.textContent = `Grazie di averci scritto, ${result.data.name}!`;
      done.hidden = false;
      form.hidden = true;
      done.focus();
    } else {
      status(form, 'Messaggio inviato. Grazie!', 'ok');
    }
    form.reset();
  } catch {
    status(form, FALLBACK, 'error');
    turnstile.reset(form);
  } finally {
    setBusy(form, false);
  }
}

/** Delegazione sul document: vale anche per i form inseriti dopo (modali da <template> o fetch). */
export function initForms(): void {
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-form]')) return;
    e.preventDefault();
    void submit(form);
  });
  document.addEventListener('focusin', (e) => {
    const form = (e.target as Element | null)?.closest?.('form[data-form]');
    if (form instanceof HTMLFormElement) void turnstile.prepare(form).catch(() => undefined);
  });
  document.addEventListener('input', (e) => {
    const f = e.target;
    if (
      (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement) &&
      f.getAttribute('aria-invalid') === 'true'
    ) {
      showError(f, errorFor(f));
    }
  });
  document.addEventListener('click', (e) => {
    const again = (e.target as Element).closest('[data-form-again]');
    const done = again?.closest<HTMLElement>('[data-form-done]');
    const form = done?.parentElement?.querySelector<HTMLFormElement>('form[data-form]');
    if (done && form) {
      done.hidden = true;
      form.hidden = false;
      status(form, '');
      form.querySelector<HTMLElement>('.field__control')?.focus();
    }
  });
}
