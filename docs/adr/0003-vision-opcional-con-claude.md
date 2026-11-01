# ADR 0003 · Visión opcional con Claude y dónde encaja YOLO

Fecha: 2026-11-01 · Estado: aceptado

## Contexto

Se evaluó usar YOLO para detectar a la persona y la API de Claude para completar el análisis, tanto
en la cámara como con foto, y también qué pasaría usando solo Claude.

- **Ni YOLO ni Claude generan imágenes.** YOLO detecta (cajas, 17 puntos COCO, máscaras); Claude
  mira y responde texto o JSON. Vestir a la persona lo siguen haciendo el motor WebGL de la cámara y
  la vista aproximada (ADR 0002) y la difusión en Spaces de Hugging Face (ADR 0001).
- **Solo Claude no es un probador.** No genera la imagen, tarda segundos por llamada (no sirve a
  30 fps) y sus coordenadas del cuerpo no son lo bastante precisas ni estables para el rig. Quedaría
  como asesor que mira fotos.
- **YOLO en la cámara empeora lo que hay.** YOLO-pose no da punta del pie ni talón (el calzado los
  necesita), no trae segmentación de piel y pelo (la oclusión depende de ella) y en el navegador
  rinde menos que MediaPipe. Además Ultralytics es AGPL-3.0.
- **Claude no tiene capa gratuita por API** y el proyecto sigue sin presupuesto. Groq cubre hoy la
  visión gratis, con un cupo pequeño.

## Decisión

1. **La cámara no cambia:** MediaPipe Pose y `selfie_multiclass` en el navegador.
2. **Claude entra como proveedor de visión opcional**, con la misma función que Groq: aviso de
   encuadre de la foto y etiquetado de prendas en admin.
   - `VISION_PROVIDER=groq` (por defecto) o `claude`, más `ANTHROPIC_API_KEY` y
     `CLAUDE_VISION_MODEL` (por defecto `claude-haiku-5-5`, el más barato con visión).
   - Con `claude`, la cadena es Claude → Groq. Si Claude falla, no tiene saldo, se niega o se queda
     sin cupo, responde Groq; si ninguno puede, el análisis se omite como antes.
   - Salidas estructuradas (`output_config.format` con esquema JSON) y `effort: low`. La respuesta
     pasa por la misma validación que la de Groq.
   - Sin reintentos del SDK y tope de 20 llamadas por minuto: el tope es para el gasto, no por cupo.
   - El prompt de la foto es el mismo: prohíbe comentar el cuerpo, el peso, la edad o el atractivo.
3. **El código** separa lo común (`VisionClient`: caché por hash, cupo, interpretación) de cada
   proveedor (`GroqVision`, `ClaudeVision`) y de la cadena (`FallbackVision`).

## Consecuencias

- Sin `ANTHROPIC_API_KEY` todo funciona igual que antes, gratis.
- Con Claude, cada foto cuesta unos 1 000–1 600 tokens de entrada; con Haiku 5.5 son unos
  0,0003 USD por llamada. Un tope de gasto en la consola de Anthropic es la protección real.
- **Privacidad:** con Claude activo, la foto de la persona también sale hacia Anthropic. Si se
  activa en producción, hay que nombrarlo en el aviso previo a subir la foto.
- **Pendiente (fase A, gratuita):** calcular la pose de la foto del usuario en el worker para darle
  la vista aproximada al instante, como ya tienen los 12 modelos, y una revisión de encuadre
  determinista antes de llamar a ningún modelo de visión. Para eso conviene MediaPipe (da pies)
  antes que YOLO; YOLO solo si se necesita detección de varias personas o segmentación.
- **Pendiente (con presupuesto):** Claude como juez de la prueba realista (comparar prenda y
  resultado de la difusión y pasar al siguiente motor de la cadena si no se parece).
