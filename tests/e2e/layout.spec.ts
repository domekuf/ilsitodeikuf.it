import { expect, test } from '@playwright/test';

const isMobile = (name: string) => name === 'mobile';

test.describe('menu', () => {
  test('desktop: link inline, voce attiva marcata', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'solo desktop');
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principale' });
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Apri il menu' })).toBeHidden();
  });

  test('mobile: si apre col tap, si chiude con Esc e il focus torna al bottone', async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), 'solo mobile');
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Apri il menu' });
    await button.click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('mobile: funziona da tastiera', async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), 'solo mobile');
    await page.goto('/');
    await page.getByRole('button', { name: 'Apri il menu' }).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Chiudi il menu' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
  });
});

test.describe('social dock', () => {
  const links = [
    ['Kuf su Facebook', 'https://www.facebook.com/kufff'],
    ['Kuf su YouTube', 'https://www.youtube.com/channel/UCTWu6UbxU95DmHe3LJIHbrw'],
    ['Kuf su Instagram', 'https://www.instagram.com/kuf.quellichesuonano'],
    ['Kuf su Spotify', 'https://open.spotify.com/artist/19RHxgdzVkXbRI6IcwMPz3'],
    ['Kuf su SoundCloud', 'https://soundcloud.com/kuf-4'],
  ] as const;

  test('desktop: colonna sempre visibile con tooltip', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'solo desktop');
    await page.goto('/');
    for (const [name, href] of links) {
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', href);
      await expect(page.getByRole('link', { name })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Social dei Kuf' })).toBeHidden();
    const fb = page.getByRole('link', { name: 'Kuf su Facebook' });
    await fb.hover();
    await expect(fb.locator('xpath=following-sibling::span')).toHaveCSS('opacity', '1');
  });

  test('mobile: speed dial con tap, Esc e tap fuori', async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), 'solo mobile');
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Social dei Kuf' });
    const fb = page.getByRole('link', { name: 'Kuf su Facebook' });
    await expect(fb).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const [name] of links) await expect(page.getByRole('link', { name })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(fb).toBeHidden();

    await toggle.click();
    await expect(fb).toBeVisible();
    await page.mouse.click(20, 200);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('modali con URL', () => {
  test('accesso diretto: la modale arriva aperta e si chiude verso la lista', async ({ page }) => {
    await page.goto('/styleguide/esempio/almagia');
    const dialog = page.getByRole('dialog', { name: /Artificierie Almagià/i });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
    await dialog.getByRole('link', { name: 'Chiudi' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/styleguide$/);
    await expect(page).toHaveTitle('Styleguide · Il Sito dei Kuf');
  });

  test('dalla lista: apre, cambia URL e titolo; indietro e avanti sono coerenti', async ({ page }) => {
    await page.goto('/styleguide');
    const link = page.getByRole('link', { name: /L'Urlo/ });
    await link.click();
    const dialog = page.getByRole('dialog', { name: /L'Urlo/i });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/styleguide\/esempio\/l-urlo$/);
    await expect(page).toHaveTitle(/L'Urlo/);

    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/styleguide$/);
    await expect(page).toHaveTitle('Styleguide · Il Sito dei Kuf');
    await expect(link).toBeFocused();

    await page.goForward();
    await expect(page.getByRole('dialog', { name: /L'Urlo/i })).toBeVisible();
    await expect(page).toHaveURL(/\/styleguide\/esempio\/l-urlo$/);
  });

  test('Esc e clic sul fondo chiudono', async ({ page }) => {
    await page.goto('/styleguide');
    await page.getByRole('link', { name: /Locale di esempio/ }).click();
    const dialog = page.getByRole('dialog', { name: /Locale di esempio/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/styleguide$/);

    await page.getByRole('link', { name: /Locale di esempio/ }).click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5); // fuori dal pannello
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/styleguide$/);
  });

  test('Contattaci si apre sopra la pagina corrente e torna indietro', async ({ page }, info) => {
    await page.goto('/styleguide');
    if (isMobile(info.project.name)) {
      await page.getByRole('button', { name: 'Apri il menu' }).click();
      await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Contattaci' }).click();
    } else {
      await page
        .getByRole('navigation', { name: 'Principale' })
        .getByRole('link', { name: 'Contattaci' })
        .click();
    }
    const dialog = page.getByRole('dialog', { name: 'Scrivici' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/contattaci$/);
    await expect(dialog.getByRole('link', { name: 'kuf.ravenna@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:kuf.ravenna@gmail.com',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/styleguide$/);
  });

  test('/contattaci diretto: home con la modale aperta', async ({ page }) => {
    await page.goto('/contattaci');
    const dialog = page.getByRole('dialog', { name: 'Scrivici' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('link', { name: 'Chiudi' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle('Il Sito dei Kuf');
  });
});

test.describe('senza JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('il dettaglio è leggibile e la X porta alla lista', async ({ page }) => {
    await page.goto('/styleguide/esempio/almagia');
    await expect(page.getByRole('heading', { name: 'Artificierie Almagià' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chiudi' }).first()).toHaveAttribute('href', '/styleguide');
  });
});

test.describe('movimento ridotto', () => {
  test.use({ reducedMotion: 'reduce' });

  test('le transizioni sono spente', async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), 'il menu a overlay è solo mobile');
    await page.goto('/');
    await page.getByRole('button', { name: 'Apri il menu' }).click();
    const item = page.locator('.menu__item').first();
    const duration = await item.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => parseFloat(d) <= 0.0001)).toBe(true);
  });
});
