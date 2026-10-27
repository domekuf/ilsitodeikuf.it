// Dati finti per la styleguide (solo sviluppo).
export const examples = [
  {
    slug: 'almagia',
    date: 'ven 17 nov 2017',
    title: 'Artificierie Almagià',
    city: 'Ravenna',
    status: 'Passato',
  },
  { slug: 'l-urlo', date: 'ven 13 nov 2015', title: "L'Urlo", city: 'Forlì', status: 'Passato' },
  {
    slug: 'esempio',
    date: 'sab 13 dic 2026',
    title: 'Locale di esempio',
    city: 'Ravenna',
    status: 'Prossimo',
  },
] as const;

export type Example = (typeof examples)[number];
