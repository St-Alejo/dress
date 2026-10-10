# ADR 0001 · Fotos reales y motor de prueba gratuito

Fecha: 2026-10-10 · Estado: aceptado

## Contexto

La primera versión dibujaba cada prenda con código (SVG) sobre cuerpos también dibujados. Cubría
XS–4XL sin depender de fotos, pero la tienda no parecía una tienda y la prueba "Con tu foto" solo
funcionaba con un proveedor simulado: los adaptadores de FASHN y Gemini eran stubs, y la API de
imagen de Gemini dejó de tener capa gratuita. El proyecto no tiene presupuesto para APIs de pago.

Los probadores comerciales (Google "Try it on", FASHN, Walmart "Be Your Own Model") siguen el mismo
esquema: foto real de producto, foto de la persona de cuerpo entero, un modelo de difusión que viste
la foto, y un aviso de que la imagen muestra cómo se ve, no cómo ajusta.

## Decisión

1. **Solo fotos reales.** Cada prenda y cada modelo exige foto (columna obligatoria); se elimina el
   generador de ilustraciones. Las fotos vienen de Pexels, se normalizan con `prepare_catalog.py` y
   se acreditan en `/creditos`.
2. **Motor: Spaces gratuitos de Hugging Face**, con FASHN VTON 1.5 (Apache-2.0) como principal y
   Leffa e IDM-VTON de respaldo, encadenados (`hf-chain`).
3. **"Cuerpo similar" = prueba real pregenerada.** La prenda se viste con IA sobre la foto de un
   modelo del catálogo, una sola vez por par, y el resultado queda publicado.
4. **Groq solo mira.** Su modelo de visión revisa el encuadre de la foto y propone etiquetas de
   prenda. Es un aviso: nunca rechaza una foto ni bloquea el flujo.

## Consecuencias

- La tienda se ve como una tienda y la prueba virtual es real, con costo cero.
- **Cuota:** ZeroGPU da ~2 min de GPU al día sin token y ~5 con token gratuito, compartidos por
  todos los usuarios. Sirve para una demo, no para tráfico real; con presupuesto, el mismo contrato
  admite un motor de pago sin tocar la API ni la web.
- **Fragilidad:** un Space público puede caerse o cambiar de firma sin aviso. Lo mitigan la cadena de
  respaldo, el circuit breaker por motor y el guardado de cada prueba generada.
- **Privacidad:** la foto de la persona sale hacia un servicio de terceros (el Space). El aviso
  previo a subirla y el borrado a las 24 h se mantienen; las pruebas que se publican en el catálogo
  usan solo fotos de banco, nunca de clientes.
- La cámara en vivo superpone el recorte plano de la foto: es menos fiel que el dibujo a medida y
  solo se ofrece para prendas fotografiadas solas. Las anclas del recorte son proporciones típicas.
- Las fotos de prendas puestas en una persona (pantalones, faldas, algunas chaquetas) funcionan en el
  motor pero no en la cámara. Calzado y accesorios se venden con foto, sin prueba virtual.
- `BodyGeometry` y las medidas de cada modelo se conservan: las usan las invariantes éticas y el
  motor de tallas.
