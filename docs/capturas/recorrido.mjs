// Recorrido real de la app local con capturas (ver README.md de esta carpeta).
// Uso: node docs/capturas/recorrido.mjs <dirCapturas> <fotoPersona> [catalogo camiseta jean vestido modelo creditos]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out, personPhoto, ...only] = process.argv.slice(2);
const BASE = 'http://localhost:4200';
mkdirSync(out, { recursive: true });
const wants = (step) => only.length === 0 || only.includes(step);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'es-CO' });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  [error de página]', e.message));
const shot = async (name, opts = {}) => {
  await page.screenshot({ path: join(out, name), ...opts });
  console.log('  captura', name);
};
const garments = await (await context.request.get(`${BASE}/api/catalog/garments`)).json();
const idOf = (name) => garments.find((g) => g.name === name).id;

async function tryOnWithPhoto(garmentName, prefix) {
  console.log(`> con tu foto: ${garmentName}`);
  await page.goto(`${BASE}/prenda/${idOf(garmentName)}`);
  await page.getByRole('tab', { name: 'Con tu foto' }).click();
  await page.getByRole('button', { name: 'Usar una foto' }).click();
  for (const box of await page.locator('app-privacy-checklist input[type=checkbox]').all()) await box.check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('input[type=file]').first().setInputFiles(personPhoto);
  await page.getByRole('button', { name: 'Subir foto preparada' }).waitFor();
  await shot(`${prefix}-a-foto-preparada.png`);
  await page.getByRole('button', { name: 'Subir foto preparada' }).click();
  const generate = page.getByRole('button', { name: /Generar imagen|Generar de todos modos/ });
  await generate.first().waitFor({ timeout: 60_000 });
  await shot(`${prefix}-b-foto-revisada.png`);
  const started = Date.now();
  await generate.first().click();
  await page.getByText('Generando tu imagen').waitFor({ timeout: 15_000 }).catch(() => undefined);
  await shot(`${prefix}-c-generando.png`);
  const done = page.getByText('Con la prenda', { exact: true });
  const problem = page.getByText(/No pudimos generar la imagen ahora|No se pudo generar/);
  await Promise.race([done.waitFor({ timeout: 330_000 }), problem.first().waitFor({ timeout: 330_000 })]);
  const ok = await done.isVisible();
  console.log(`  ${ok ? 'resultado' : 'SIN RESULTADO'} en ${Math.round((Date.now() - started) / 1000)} s`);
  await page.waitForTimeout(1500);
  await page.locator('app-photo-tryon').scrollIntoViewIfNeeded();
  await shot(`${prefix}-d-${ok ? 'resultado' : 'sin-resultado'}.png`, { fullPage: true });
  return ok;
}

if (wants('catalogo')) {
  console.log('> catálogo');
  await page.goto(BASE);
  await page.locator('a[href^="/prenda/"] img').first().waitFor();
  await page.waitForLoadState('networkidle');
  await shot('01-catalogo.png');
  await shot('01-catalogo-completo.png', { fullPage: true });
  for (const [label, file] of [['Vestidos', '02-catalogo-vestidos.png'], ['Inferiores', '02-catalogo-inferiores.png']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(600);
    await shot(file, { fullPage: true });
  }
  await page.goto(`${BASE}/prenda/${idOf('Camiseta corta naranja')}`);
  await page.locator('.stage img').waitFor();
  await page.waitForLoadState('networkidle');
  await shot('03-prenda.png');
}

if (wants('camiseta')) await tryOnWithPhoto('Camiseta corta naranja', '04-camiseta');
if (wants('jean')) await tryOnWithPhoto('Jean ancho claro', '05-jean');
if (wants('vestido')) await tryOnWithPhoto('Vestido rojo plisado', '06-vestido');

if (wants('modelo')) {
  console.log('> cuerpo similar: vestido sobre un modelo del catálogo');
  await page.goto(`${BASE}/prenda/${idOf('Vestido negro de flores')}`);
  await page.getByRole('radio').first().waitFor();
  await page.getByRole('radio').nth(2).click();
  await page.waitForTimeout(800);
  await page.locator('app-body-picker').scrollIntoViewIfNeeded();
  await shot('07-modelo-a-elegido.png');
  const started = Date.now();
  await page.getByRole('button', { name: 'Ver la prenda en este modelo' }).click();
  await page.waitForTimeout(1500);
  await shot('07-modelo-b-generando.png');
  const done = page.getByText('Prueba generada con IA sobre un modelo real');
  const problem = page.getByText(/ocupado o sin cupo|No se pudo generar la prueba/);
  await Promise.race([done.waitFor({ timeout: 330_000 }), problem.first().waitFor({ timeout: 330_000 })]);
  const ok = await done.isVisible();
  console.log(`  ${ok ? 'resultado' : 'SIN RESULTADO'} en ${Math.round((Date.now() - started) / 1000)} s`);
  await page.waitForTimeout(1500);
  await page.locator('.stage').scrollIntoViewIfNeeded();
  await shot(`07-modelo-c-${ok ? 'resultado' : 'sin-cupo'}.png`);
}

if (wants('creditos')) {
  console.log('> créditos');
  await page.goto(`${BASE}/creditos`);
  await page.locator('li img').first().waitFor();
  await page.waitForLoadState('networkidle');
  await shot('08-creditos.png');
}

await browser.close();
