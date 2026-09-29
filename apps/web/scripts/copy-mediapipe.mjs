// Copia el runtime WASM de MediaPipe a public/ para servirlo desde nuestro propio
// origen: con la cámara encendida no se hacen peticiones a terceros.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// El paquete no exporta package.json; su entrada principal vive en la raíz del paquete.
const pkgDir = dirname(require.resolve('@mediapipe/tasks-vision'));
const src = join(pkgDir, 'wasm');
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) throw new Error(`No se encontró ${src}`);
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`mediapipe wasm → ${dest}`);
