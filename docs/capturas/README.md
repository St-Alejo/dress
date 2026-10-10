# Capturas de la app con el motor real

Tomadas el 2026-10-10 sobre la app local (`npm run dev:web`), con el motor `hf-chain`
(FASHN VTON 1.5 en Hugging Face, sin token) y Groq revisando la foto. Ninguna imagen está retocada.

Las capturas `04-camiseta-*` usan la foto de prueba de `docs/imagenes/` (iStock, sin licencia libre):
están en esta carpeta en local pero no se suben al repositorio. Para versionarlas, repite el recorrido
con una foto propia o de banco libre.

| Captura | Qué muestra |
|---|---|
| `01-catalogo.png`, `01-catalogo-completo.png` | Catálogo: las 47 prendas con foto real, sin dibujos |
| `02-catalogo-vestidos.png`, `02-catalogo-inferiores.png` | Filtros por categoría |
| `03-prenda.png` | Ficha de una prenda con la foto del producto |
| `04-camiseta-a-foto-preparada.png` | "Con tu foto": la foto elegida, antes de subirla |
| `04-camiseta-b-foto-revisada.png` | Foto subida y revisada (encuadre correcto, sin avisos) |
| `04-camiseta-c-generando.png` | Generación en curso |
| `04-camiseta-d-resultado.png` | **Antes y después**: la modelo con la camiseta naranja (39 s) |
| `07-modelo-a-elegido.png` | "Cuerpo similar": modelos reales y botón para ver la prenda sobre uno |
| `07-modelo-b-generando.png`, `07-modelo-c-sin-cupo.png` | Lo que ve la persona cuando el motor gratuito ya no tiene cupo ese día |
| `08-creditos.png` | Página de créditos de las fotos |

## Lo que falta capturar

La cuota anónima de Hugging Face (unos 2 minutos de GPU al día) se agotó tras cuatro pruebas, así que
el pantalón, el vestido y la prueba sobre un modelo del catálogo quedaron sin generar ese día: el
motor respondió "You have exceeded your ZeroGPU runs limit" y la app lo informa (captura 07-c). Con un `HF_TOKEN` gratuito (ver el
README principal) el cupo sube a unos 5 minutos diarios.

## Repetir el recorrido

`recorrido.mjs` abre la app en Chrome sin ventana, sube la foto, genera las pruebas y guarda las
capturas. Necesita la app levantada y Chrome instalado:

```bash
npm install --no-save playwright-core
node docs/capturas/recorrido.mjs docs/capturas <foto-de-cuerpo-entero.jpg>            # todo
node docs/capturas/recorrido.mjs docs/capturas <foto.jpg> jean vestido modelo         # solo esos pasos
```

Pasos disponibles: `catalogo`, `camiseta`, `jean`, `vestido`, `modelo`, `creditos`.
