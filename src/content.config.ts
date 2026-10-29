// Content collections (§4). Gli articoli e i dischi si aggiornano con file Markdown nel repo.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articoli = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/articoli' }),
  schema: ({ image }) =>
    z.object({
      nome: z.string(),
      immagine: image(),
      alt: z.string(),
      /** altre foto per la galleria del dettaglio */
      galleria: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      disponibile: z.boolean().default(true),
      ordine: z.number().int().default(100),
      // Niente prezzo, di proposito (decisione 6 del brief).
    }),
});

const albums = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/albums' }),
  schema: ({ image }) =>
    z.object({
      titolo: z.string(),
      anno: z.number().int(),
      sottotitolo: z.string(),
      cover: image(),
      coverAlt: z.string(),
      tracklist: z.array(z.string()).min(1),
      video: z
        .array(
          z.object({
            id: z.string().regex(/^[\w-]{11}$/),
            start: z.union([z.number(), z.string()]).optional(),
          }),
        )
        .default([]),
      ascolta: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
      /** chiave dello zip su R2 e nome del file scaricato */
      download: z.object({ key: z.string(), filename: z.string() }),
      ordine: z.number().int(),
    }),
});

export const collections = { articoli, albums };
