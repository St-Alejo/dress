// Mide una sola vez la pose y la segmentación de las fotos de modelos del catálogo con el
// mismo MediaPipe que usa la cámara, en un Chrome sin interfaz. El resultado
// (seed/photos/bodies/<id>.pose.json) permite vestir cualquier prenda sobre cualquier
// modelo al instante, sin IA ni cuota: la "vista aproximada" del modo cuerpo similar.
//
// Uso (desde la raíz, con `npm run vision:copy -w apps/web` hecho):
//   node apps/web/scripts/body-poses.mjs [b01,b02…]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const root = join(web, '..', '..');
const bodiesDir = join(root, 'seed', 'photos', 'bodies');
const only = (process.argv[2] ?? '').split(',').filter(Boolean);
const SEG_W = 192;
const SEG_H = 256;

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream' };
const routes = [
  ['/vision/', join(root, 'node_modules', '@mediapipe', 'tasks-vision') + '/'],
  ['/mediapipe/', join(web, 'public', 'mediapipe') + '/'],
  ['/models/', join(web, 'public', 'models') + '/'],
  ['/bodies/', bodiesDir + '/'],
];
const page = `<!doctype html><meta charset="utf-8"><script type="module">
  import * as vision from '/vision/vision_bundle.mjs';
  const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const pose = await vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/pose_landmarker_full.task', delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1 });
  const seg = await vision.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/selfie_multiclass_256x256.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false });
  window.measure = async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const lm = pose.detect(img).landmarks[0] ?? [];
    const c = document.createElement('canvas');
    c.width = ${SEG_W}; c.height = ${SEG_H};
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const r = seg.segment(c);
    const labels = Array.from(r.categoryMask.getAsUint8Array());
    r.close();
    return { width: img.naturalWidth, height: img.naturalHeight, landmarks: lm.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), v: +(p.visibility ?? 1).toFixed(3) })), labels };
  };
  window.ready = true;
</script>`;

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(page);
  const route = routes.find(([prefix]) => url.startsWith(prefix));
  const file = route && join(route[1], url.slice(route[0].length));
  if (!file || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

/** Codificación por tramos [etiqueta, longitud, …]: la máscara pesa unos cientos de bytes. */
function rle(labels) {
  const out = [];
  for (let i = 0; i < labels.length; ) {
    let j = i;
    while (j < labels.length && labels[j] === labels[i]) j++;
    out.push(labels[i], j - i);
    i = j;
  }
  return out;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const tab = await browser.newPage();
  tab.on('pageerror', (e) => console.error('[página]', e.message));
  await tab.goto(base);
  await tab.waitForFunction(() => window.ready === true, null, { timeout: 120_000 });
  const ids = readdirSync(bodiesDir).filter((f) => /^b\d+\.jpg$/.test(f)).map((f) => f.slice(0, -4)).filter((id) => !only.length || only.includes(id));
  for (const id of ids) {
    const m = await tab.evaluate((src) => window.measure(src), `/bodies/${id}.jpg`);
    if (m.landmarks.length !== 33) {
      console.warn(`${id}: no se detectó a la persona`);
      continue;
    }
    const out = { version: 1, width: m.width, height: m.height, landmarks: m.landmarks, seg: { width: SEG_W, height: SEG_H, rle: rle(m.labels) } };
    writeFileSync(join(bodiesDir, `${id}.pose.json`), JSON.stringify(out) + '\n');
    console.log(`${id}: pose y segmentación`);
  }
} finally {
  await browser.close();
  server.close();
}
