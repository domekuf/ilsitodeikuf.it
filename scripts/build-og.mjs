// Immagini Open Graph (1200×630) per la home e per i concerti, disegnate in HTML e fotografate
// con il Chromium di Playwright (già tra le dipendenze di sviluppo). Le pagine dei dischi usano la cover.
// Uso: node scripts/build-og.mjs   (PW_CHROMIUM_PATH opzionale, come per i test)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const b64 = (p) => readFileSync(`${root}/${p}`).toString('base64');
const wordmark = readFileSync(`${root}/src/assets/logo/kuf-wordmark.svg`, 'utf8');

const base = `
  @font-face { font-family: Montserrat; font-weight: 300; src: url(data:font/woff2;base64,${b64('src/assets/fonts/montserrat-light.woff2')}) format('woff2'); }
  @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${b64('src/assets/fonts/inter-latin-var.woff2')}) format('woff2'); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; color: #141414; font-family: Inter, sans-serif;
         background: #fbfaf7 url(data:image/webp;base64,${b64('src/assets/textures/paper.webp')}); }
  .logo svg { width: 100%; height: auto; display: block; }
  .eyebrow { font-size: 22px; letter-spacing: .28em; text-transform: uppercase; color: #6e675a; }
  .sep { width: 110px; height: 2px; background: rgb(20 20 20 / .6); }
`;

const pages = {
  home: `
    <style>${base}
      body { display: grid; grid-template-columns: 500px 1fr; gap: 56px; align-items: center; padding: 0 64px; }
      .text { display: flex; flex-direction: column; gap: 34px; }
      .logo { width: 400px; }
      .claim { font-size: 34px; line-height: 1.3; }
      .photo { width: 100%; height: 470px; object-fit: cover; border-radius: 8px; filter: grayscale(1) contrast(1.04); }
    </style>
    <div class="text">
      <div class="logo">${wordmark}</div>
      <p class="claim">Un gruppo di Ravenna che, a volte, fa la musica forte.</p>
      <p class="eyebrow">ilsitodeikuf.it</p>
    </div>
    <img class="photo" src="data:image/jpeg;base64,${b64('src/assets/band/kuf-gruppo.jpg')}">`,
  concerti: `
    <style>${base}
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; text-align: center; }
      .logo { width: 220px; }
      h1 { font-family: Montserrat; font-weight: 300; font-size: 120px; letter-spacing: .06em; text-transform: uppercase; line-height: 1; margin-top: 30px; }
    </style>
    <div class="logo">${wordmark}</div>
    <h1>Concerti</h1>
    <div class="sep"></div>
    <p class="eyebrow">Per sentire i Kuf</p>`,
};

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, html] of Object.entries(pages)) {
  await page.setContent(`<!doctype html><meta charset="utf-8">${html}`);
  await page.evaluate(() => document.fonts.ready);
  const path = `${root}/public/og/${name}.jpg`;
  await page.screenshot({ path, type: 'jpeg', quality: 85 });
  console.log(`public/og/${name}.jpg`);
}
await browser.close();
