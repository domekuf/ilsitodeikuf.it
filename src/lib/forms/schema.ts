// Validazione dei form (Zod 4), con i messaggi in italiano. Usata dalle Actions.
// Nei form Astro un campo assente arriva come null: per questo i facoltativi sono .nullish().
import { z } from 'astro/zod';

const singleLine = (max: number, msg: string) =>
  z
    .string({ error: 'Questo campo è obbligatorio.' })
    .trim()
    .min(1, 'Questo campo è obbligatorio.')
    .max(max, msg)
    .refine((v) => !/[\r\n]/.test(v), 'Scrivilo su una riga sola.');

const common = {
  name: singleLine(100, 'Il nome è un po’ troppo lungo.'),
  email: z
    .string({ error: 'Questo campo è obbligatorio.' })
    .trim()
    .min(1, 'Questo campo è obbligatorio.')
    .max(200, 'L’email è troppo lunga.')
    .pipe(z.email({ error: 'Quest’email non ci piace: controlla che ci sia la @.' })),
  /** checkbox degli aggiornamenti: presente solo se spuntata */
  updates: z
    .string()
    .nullish()
    .transform((v) => v === '1' || v === 'on'),
  /** honeypot: le persone lo lasciano vuoto */
  website: z
    .string()
    .max(500)
    .nullish()
    .transform((v) => v ?? ''),
  'cf-turnstile-response': z
    .string()
    .max(2048)
    .nullish()
    .transform((v) => v ?? ''),
  page: z
    .string()
    .max(200)
    .nullish()
    .transform((v) => (v && v.startsWith('/') ? v : undefined)),
};

export const contactSchema = z.object({
  ...common,
  message: z
    .string({ error: 'Questo campo è obbligatorio.' })
    .trim()
    .min(1, 'Questo campo è obbligatorio.')
    .max(5000, 'Il messaggio è troppo lungo (massimo 5.000 caratteri).'),
  subject: z
    .string()
    .trim()
    .max(140)
    .nullish()
    .transform((v) => v || undefined),
  context: z
    .string()
    .max(500)
    .nullish()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      try {
        const v = JSON.parse(raw) as { type?: unknown; slug?: unknown; nome?: unknown };
        if (v.type === 'articolo' && typeof v.slug === 'string' && typeof v.nome === 'string') {
          return { type: 'articolo' as const, slug: v.slug.slice(0, 100), nome: v.nome.slice(0, 140) };
        }
      } catch {
        // contesto non valido: lo ignoriamo
      }
      ctx.addIssue({ code: 'custom', message: 'Contesto non valido.' });
      return z.NEVER;
    }),
});

export const downloadSchema = z.object({
  ...common,
  album: z.enum(['pigna', 'via-trieste'], { error: 'Disco sconosciuto.' }),
  message: z
    .string()
    .trim()
    .max(5000, 'Il messaggio è troppo lungo (massimo 5.000 caratteri).')
    .nullish()
    .transform((v) => v ?? ''),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type DownloadInput = z.infer<typeof downloadSchema>;
