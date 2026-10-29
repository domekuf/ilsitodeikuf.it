// Slug per gli URL (§7.3): minuscolo, senza accenti, solo lettere, numeri e trattini.

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accenti
    .toLowerCase()
    .replace(/['’`]/g, '') // l'unico → lunico, come si scrive a voce
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Rende unici gli slug di una lista, nell'ordine dato: il primo resta com'è,
 * i successivi prendono -2, -3, … Chiamala sempre sullo stesso ordine (per data)
 * così gli URL restano stabili.
 */
export function uniqueSlugs(slugs: readonly string[]): string[] {
  const used = new Set<string>();
  return slugs.map((base) => {
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  });
}
