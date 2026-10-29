#!/usr/bin/env node
// Scarica le miniature dei video YouTube (src/content/albums/*.md), toglie le bande nere
// e le salva ritagliate in 16:9 in src/assets/video/<id>.jpg, con i titoli in src/content/video-meta.json.
// Così la build non dipende dalla rete e le miniature non hanno margini neri.
//
// Uso: node scripts/build-video-thumbs.mjs   (da rilanciare quando si aggiunge un video)
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const outDir = new URL('src/assets/video/', root);
await mkdir(outDir, { recursive: true });

// ID dai frontmatter dei dischi (le righe "- id: xxxxxxxxxxx")
const albumsDir = new URL('src/content/albums/', root);
const ids = [];
for (const f of await readdir(albumsDir)) {
  if (!f.endsWith('.md')) continue;
  const text = await readFile(new URL(f, albumsDir), 'utf8');
  for (const m of text.matchAll(/^\s*-\s*id:\s*([\w-]{11})\s*$/gm)) ids.push(m[1]);
}

async function fetchImage(id) {
  for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`);
    if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), name };
  }
  throw new Error(`nessuna miniatura per ${id}`);
}

/** Bande nere: righe/colonne quasi nere sui bordi. Ritorna il riquadro del contenuto. */
async function contentBox(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const dark = (v) => v < 28;
  const rowDark = (y) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (dark(data[y * w + x])) n++;
    return n / w > 0.97;
  };
  const colDark = (x, top, bottom) => {
    let n = 0;
    for (let y = top; y < bottom; y++) if (dark(data[y * w + x])) n++;
    return n / (bottom - top) > 0.97;
  };
  let top = 0;
  while (top < h / 3 && rowDark(top)) top++;
  let bottom = h;
  while (bottom > (h * 2) / 3 && rowDark(bottom - 1)) bottom--;
  let left = 0;
  while (left < w / 3 && colDark(left, top, bottom)) left++;
  let right = w;
  while (right > (w * 2) / 3 && colDark(right - 1, top, bottom)) right--;
  return { left, top, width: right - left, height: bottom - top, w, h };
}

const meta = {};
for (const id of ids) {
  const { buf, name } = await fetchImage(id);
  const box = await contentBox(buf);
  // dentro il contenuto, ritaglio 16:9 centrato (come object-fit: cover)
  let cw = box.width;
  let ch = Math.round((cw * 9) / 16);
  if (ch > box.height) {
    ch = box.height;
    cw = Math.round((ch * 16) / 9);
  }
  const left = box.left + Math.round((box.width - cw) / 2);
  const top = box.top + Math.round((box.height - ch) / 2);
  await sharp(buf)
    .extract({ left, top, width: cw, height: ch })
    .resize({ width: Math.min(1280, cw) })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(new URL(`${id}.jpg`, outDir).pathname);

  let title = `Video ${id}`;
  try {
    const watch = `https://www.youtube.com/watch?v=${id}`;
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`);
    if (res.ok) title = (await res.json()).title?.trim() || title;
  } catch {
    // resta l'ID
  }
  meta[id] = { title };
  console.log(
    `${id}  ${name} ${box.w}x${box.h} → contenuto ${box.width}x${box.height} → ${cw}x${ch}  "${title}"`,
  );
}

await writeFile(new URL('src/content/video-meta.json', root), JSON.stringify(meta, null, 2) + '\n');
