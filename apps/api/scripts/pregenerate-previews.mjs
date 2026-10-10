// Genera, poco a poco, las pruebas reales "prenda sobre modelo" que faltan en el catálogo.
// Los motores gratuitos tienen cuota diaria de GPU, así que el script es reanudable:
// salta los pares ya generados y se detiene en cuanto el motor responde que no tiene cupo.
//
// Uso (con la API levantada):
//   node apps/api/scripts/pregenerate-previews.mjs [--max 6] [--api http://localhost:3000/api]
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const API = option('--api', 'http://localhost:3000/api');
const MAX = Number(option('--max', '6'));
const WEARABLE = new Set(['top', 'bottom', 'dress', 'outerwear']);
// El endpoint admite 6 peticiones por minuto.
const PAUSE_MS = 11_000;

const get = async (path) => {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const garments = (await get('/catalog/garments')).filter((g) => WEARABLE.has(g.category));
const bodies = await get('/catalog/body-models');

// Por rondas: primero una prenda sobre cada modelo, luego la siguiente, para repartir el cupo.
const pending = [];
for (const garment of garments) {
  for (const body of bodies) {
    if (!body.previewImages[garment.id]) pending.push({ garment, body });
  }
}
console.log(`faltan ${pending.length} de ${garments.length * bodies.length} pruebas; se intentan ${Math.min(MAX, pending.length)}`);

let done = 0;
for (const { garment, body } of pending.slice(0, MAX)) {
  const started = Date.now();
  const res = await fetch(`${API}/tryon/model-previews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bodyModelId: body.id, garmentId: garment.id }),
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (res.status === 503) {
    console.log(`motor sin cupo o no disponible tras ${seconds} s: se detiene aquí. Vuelve a ejecutarlo más tarde.`);
    break;
  }
  if (!res.ok) {
    console.log(`✗ ${garment.name} · ${body.bodyTypeTag}: HTTP ${res.status}`);
  } else {
    done++;
    console.log(`✓ ${garment.name} · ${body.bodyTypeTag} (${seconds} s)`);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}
console.log(`generadas ${done}; quedan ${pending.length - done}`);
