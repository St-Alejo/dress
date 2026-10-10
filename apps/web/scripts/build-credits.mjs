// Genera public/photo-credits.json a partir de los créditos del seed (única fuente).
// Antes se fusionaba a mano y la copia de la web ya se había desviado del seed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const photos = join(here, '..', '..', '..', 'seed', 'photos');
const read = (kind) => JSON.parse(readFileSync(join(photos, kind, 'credits.json'), 'utf8'));

// La imagen Docker de la web no copia seed/: allí se usa la copia ya versionada en public/.
if (!existsSync(join(photos, 'garments', 'credits.json'))) {
  console.log('créditos: seed/photos no está disponible; se conserva public/photo-credits.json');
  process.exit(0);
}

const credits = { garments: read('garments'), bodies: read('bodies') };
writeFileSync(join(here, '..', 'public', 'photo-credits.json'), JSON.stringify(credits, null, 2) + '\n');
console.log(`créditos: ${Object.keys(credits.garments).length} prendas, ${Object.keys(credits.bodies).length} cuerpos`);
