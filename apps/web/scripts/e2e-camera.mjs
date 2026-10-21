// Prueba de punta a punta de la cámara en vivo con una cámara falsa: Chrome reproduce un
// video .y4m (hecho aquí a partir de una foto de modelo del catálogo, con un leve vaivén)
// como si fuera la webcam. Comprueba que la prenda se dibuja sobre el torso y que el bucle
// va a una velocidad usable, y guarda una captura por prenda.
//
// Uso (con API y web en marcha, `npm run dev:api` y `npm run dev:web`):
//   node apps/web/scripts/e2e-camera.mjs [--out docs/capturas] [--body b05] [--min-fps 12]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdtempSync, mkdirSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const WEB = arg('web', 'http://localhost:4200');
const API = arg('api', 'http://localhost:3000/api');
const BODY = arg('body', 'b05');
const OUT = arg('out', '');
const MIN_FPS = Number(arg('min-fps', '12'));

/**
 * Prendas a probar: nombre en el catálogo y color de su tela (el test cuenta píxeles de ese
 * color dentro del torso). Se eligen colores que la persona del video no lleva puestos.
 */
const CASES = [
  { slug: 'camara-cardigan', name: 'Cárdigan rojo de punto', fabric: ([r, g, b]) => r > 120 && r > g * 1.9 && r > b * 1.9, zone: 'torso' },
  { slug: 'camara-camisa', name: 'Camisa Oxford celeste', fabric: ([r, g, b]) => b > 150 && b > r + 15 && g > r, zone: 'torso' },
  { slug: 'camara-vestido', name: 'Vestido rojo plisado', fabric: ([r, g, b]) => r > 120 && r > g * 1.9 && r > b * 1.9, zone: 'torso' },
];

const W = 640;
const H = 480;
const FRAMES = 60;

/** Video YUV4MPEG2 (4:2:0, rango completo) de la foto con un vaivén lateral suave. */
async function fakeVideo(photo, path) {
  const meta = await sharp(photo).metadata();
  const h = H;
  const w = Math.round((meta.width / meta.height) * h);
  const person = await sharp(photo).resize(w, h).removeAlpha().raw().toBuffer();
  const [br, bg, bb] = [person[0], person[1], person[2]]; // fondo liso de estudio
  const fd = openSync(path, 'w');
  writeSync(fd, `YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`);
  const rgb = new Uint8Array(W * H * 3);
  const y = new Uint8Array(W * H);
  const u = new Uint8Array((W / 2) * (H / 2));
  const v = new Uint8Array((W / 2) * (H / 2));
  for (let f = 0; f < FRAMES; f++) {
    const dx = Math.round((W - w) / 2 + 14 * Math.sin((2 * Math.PI * f) / FRAMES));
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const sx = px - dx;
        const o = (py * W + px) * 3;
        if (sx >= 0 && sx < w) {
          const s = (py * w + sx) * 3;
          rgb[o] = person[s];
          rgb[o + 1] = person[s + 1];
          rgb[o + 2] = person[s + 2];
        } else {
          rgb[o] = br;
          rgb[o + 1] = bg;
          rgb[o + 2] = bb;
        }
      }
    }
    for (let i = 0; i < W * H; i++) y[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
    for (let cy = 0; cy < H / 2; cy++) {
      for (let cx = 0; cx < W / 2; cx++) {
        let r = 0, g = 0, b = 0;
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const o = ((cy * 2 + oy) * W + cx * 2 + ox) * 3;
          r += rgb[o]; g += rgb[o + 1]; b += rgb[o + 2];
        }
        r /= 4; g /= 4; b /= 4;
        u[cy * (W / 2) + cx] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        v[cy * (W / 2) + cx] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      }
    }
    writeSync(fd, 'FRAME\n');
    writeSync(fd, y);
    writeSync(fd, u);
    writeSync(fd, v);
  }
  closeSync(fd);
}

/** Fracción de píxeles de tela en la zona central del escenario (torso de la persona). */
async function fabricShare(png, fabric) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [x0, x1, y0, y1] = [0.35, 0.65, 0.3, 0.55].map((t, i) => Math.round(t * (i < 2 ? info.width : info.height)));
  let hit = 0;
  let all = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const o = (py * info.width + px) * 3;
      all++;
      if (fabric([data[o], data[o + 1], data[o + 2]])) hit++;
    }
  }
  return hit / all;
}

const dir = mkdtempSync(join(tmpdir(), 'vestirse-cam-'));
const video = join(dir, 'persona.y4m');
await fakeVideo(join(root, 'seed', 'photos', 'bodies', `${BODY}.jpg`), video);

const garments = await (await fetch(`${API}/catalog/garments`)).json();
const list = garments.items ?? garments;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`, '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
if (OUT) mkdirSync(OUT, { recursive: true });

let failed = 0;
for (const c of CASES) {
  const g = list.find((x) => x.name === c.name);
  if (!g) {
    console.error(`✗ ${c.name}: no está en el catálogo`);
    failed++;
    continue;
  }
  await page.goto(`${WEB}/prenda/${g.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('tab').nth(1).click();
  await page.locator('app-live-tryon button.btn-primary').first().click();
  const fps = page.locator('app-live-tryon .tabular-nums');
  await fps.waitFor({ timeout: 30000 });
  await page.waitForTimeout(6000);
  const stage = page.locator('app-live-tryon > div').first();
  const shot = await stage.screenshot();
  const share = await fabricShare(shot, c.fabric);
  const rate = parseInt(await fps.innerText(), 10);
  const ok = share > 0.25 && rate >= MIN_FPS;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${c.name}: tela en el torso ${(share * 100).toFixed(0)} %, ${rate} fps`);
  if (OUT) writeFileSync(join(OUT, `${c.slug}.png`), shot);
  // Al navegar a la siguiente ficha el componente se destruye y suelta la cámara.
}
if (errors.length) console.log('errores de la página:\n' + errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
