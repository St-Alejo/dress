// Invariantes estáticas del cliente (sección 6 y sección 15.4). Se ejecuta en CI.
//  1. El código de Track A (live-overlay) no puede hacer peticiones de red:
//     el video y los frames nunca salen del dispositivo.
//  2. Nadie pide audio a la cámara.
//  3. No existen controles para modificar la silueta del cuerpo.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

const rules = [
  {
    name: 'Track A sin red',
    files: walk(join(root, 'features', 'live-overlay')),
    forbidden: /HttpClient|ApiService|fetch\(|XMLHttpRequest|WebSocket|socket\.io|sendBeacon|toDataURL|toBlob/,
  },
  { name: 'cámara sin audio', files: walk(root), forbidden: /audio\s*:\s*true/ },
  { name: 'sin edición de silueta', files: walk(root), forbidden: /slim(ming)?|reshape|silhouette-?edit|bodyEdit|beautif/i },
];

let failures = 0;
for (const rule of rules) {
  for (const file of rule.files) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // los comentarios pueden explicar la regla
        if (rule.forbidden.test(line)) {
          failures++;
          console.error(`✗ [${rule.name}] ${relative(root, file)}:${i + 1}: ${line.trim()}`);
        }
      });
  }
  console.log(`✓ ${rule.name} (${rule.files.length} archivos)`);
}
if (failures) {
  console.error(`\n${failures} violación(es) de invariantes éticas.`);
  process.exit(1);
}
