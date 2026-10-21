# ADR 0002 · Cámara con malla y oclusión, y fotos de producto para todo el catálogo

Fecha: 2026-10-21 · Estado: aceptado

## Contexto

Tras el ADR 0001, la prenda no se veía "puesta" en ningún modo instantáneo. La cámara pegaba el
recorte con un solo warp afín de tres puntos: las mangas quedaban rígidas, la prenda tapaba brazos y
manos, temblaba y desaparecía si no se veían las caderas. 19 de las 47 prendas estaban fotografiadas
sobre una persona, así que no tenían cámara. Calzado y accesorios no tenían prueba. "Cuerpo similar"
dependía de la cuota de ZeroGPU (unas 15 pruebas al día), y casi todas las combinaciones salían vacías.

La persona pidió que la ropa se vea bien puesta en todo momento, también en la cámara, con fotos
reales de producto en toda la app y gasto cero.

## Decisión

1. **Fotos de producto reales para las 47 prendas.** Salen de Pexels con crédito y licencia libre, y
   `prepare_catalog.py` (rembg más SegFormer de parsing de ropa, en CPU) las recorta.
   - Por prenda, `sources.json` admite:
     - `crop`: encuadre.
     - `erase`: polígonos que se borran, como una percha o el interior del escote.
     - `wear`: la parte que se viste cuando la foto de tienda muestra más, por ejemplo un solo
       zapato del par o el cinturón de unas botas.
     - `anchors`: corrección a mano de puntos concretos.
   - La foto de tienda queda entera; solo cambian el recorte y las anclas.
   - SegFormer clasifica la barra de la percha como tela, así que esos polígonos se marcan a mano.
2. **Anclas medidas en cada recorte**, no proporciones genéricas por categoría. Se guardan en
   `garments/<g>.anchors.json` y en `Garment.overlayAnchors`.
   - Parte de arriba: cuello, hombros, axilas, puños y bajos.
   - Parte de abajo: cintura, tiro, rodillas y tobillos.
   - Calzado: talón y punta.
3. **Motor de cámara v2 en el navegador** (`features/live-overlay/engine/`), con funciones puras más
   un renderer WebGL2 sin librerías. El Canvas 2D queda como respaldo.
   - **Pose y suavizado:** MediaPipe Pose (full, con lite si faltan fps) con un filtro One Euro por
     punto. Un punto perdido se sostiene unos 220 ms.
   - **Malla:** rig 2D con *linear blend skinning*. La manga sigue al codo y la pernera a la rodilla.
     El torso se ciñe al ancho real de pecho y cadera (`torsoWrap`). Las prendas de manga colgante
     se visten rígidas, porque su manga no está a lo largo del brazo en la foto.
   - **Oclusión:** `selfie_multiclass` da piel y pelo, se suaviza (`softenMask`) y recorta la prenda
     donde la mano o el pelo quedan por delante.
   - **Luz:** el brillo y la temperatura del torso del video tiñen la prenda.
   - **Talla:** la holgura sale de la tabla de tallas.
   - **Calzado:** un zapato por pie, dibujado en espejo con la suela plana en el suelo.
4. **El mismo motor en modo imagen** para "Cuerpo similar", la tienda (al pasar el ratón), la galería
   de la ficha y `/look`. Las 12 fotos de modelos llevan la pose y la segmentación precalculadas
   (`bodies/<b>.pose.json`). Toda combinación tiene una vista aproximada al instante, con la
   etiqueta "Vista aproximada, sin IA". La prueba con IA sigue disponible a petición.
5. **"Foto realista" desde la cámara**, solo con consentimiento explícito. El frame entra por el
   mismo flujo de la prueba con foto, con TTL de 24 h. Ningún frame sale del dispositivo sin pulsar
   ese botón.
6. **Looks guardados en el navegador** (`LookStore`, como máximo 24) y compartidos por enlace
   (`/look?prendas=…&modelo=…`). Guardan solo ids, nunca fotos ni medidas. No se guardan en la
   cuenta.
7. **Sugerencias "combina con" deterministas.** Reglas de color (HSL, neutros, denim) y de formalidad
   del estilo, con tests. No usan LLM.

## Consecuencias

- Las 47 prendas se ven puestas al instante sobre cualquiera de los 12 modelos y en la cámara. Las
  prendas de manga colgante aparecen con la manga rígida.
- La prueba e2e `apps/web/scripts/e2e-camera.mjs` pasa una cámara falsa (`.y4m` generado desde una
  foto de modelo) y exige tela en el torso y fps mínimos. En este equipo da 55–92 % de tela y
  39–50 fps.
- **Se aplaza** el endpoint del worker `POST /v1/garments/prepare`: rembg y SegFormer no caben en la
  RAM gratuita. Al cambiar la foto desde admin se invalidan miniatura y anclas, y la prenda se
  prepara de nuevo en local con `prepare_catalog.py --only <g>`.
- La vista aproximada no simula caída ni pliegues. Limitaciones conocidas:
  - El calzado propio del modelo asoma en algunas fotos.
  - Al pañuelo se le nota el recorte.
  - Las fotos de tienda de las botas incluyen el cinturón, a propósito.
- Las invariantes éticas no cambian:
  - El cuerpo de la persona nunca se deforma: el ajuste de holgura solo ensancha la prenda.
  - La foto nunca es obligatoria.
  - La cámara es local.
