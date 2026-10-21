import type { Mesh } from './rig';

/**
 * Dibuja prendas (malla + textura del recorte) con WebGL2, sin librerías.
 *
 * Por cada prenda hace dos pasadas:
 *  1. sombra de contacto: la silueta difuminada (mip alto de la textura), desplazada y
 *     oscura, para que la tela "pose" sobre el cuerpo en vez de flotar como una pegatina;
 *  2. la prenda, con la exposición y el tono de la escena y recortada por la máscara de
 *     oclusión (brazos por delante del torso, manos, cara y pelo).
 *
 * El lienzo es transparente: debajo está el <video> (o la foto del modelo) sin tocar.
 */

const VERT = `#version 300 es
in vec2 aPos;
in vec2 aUv;
in float aRegion;
uniform vec2 uSize;
uniform vec2 uOffset;
out vec2 vUv;
out float vRegion;
out vec2 vScreen;
void main() {
  vec2 p = aPos + uOffset;
  vScreen = p / uSize;
  vUv = aUv;
  vRegion = aRegion;
  gl_Position = vec4(vScreen.x * 2.0 - 1.0, 1.0 - vScreen.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
in float vRegion;
in vec2 vScreen;
uniform sampler2D uTex;
uniform sampler2D uOcc;
uniform bool uUseOcc;
uniform bool uShadow;
uniform vec3 uGain;
uniform float uOpacity;
out vec4 outColor;
void main() {
  if (uShadow) {
    float a = textureLod(uTex, vUv, 4.0).a * 0.32;
    outColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  vec4 c = texture(uTex, vUv);
  // Borde: el alfa del recorte se suaviza un poco para que no haya escalones.
  float edge = smoothstep(0.08, 0.6, c.a);
  float occ = 0.0;
  if (uUseOcc) {
    vec2 o = texture(uOcc, vScreen).rg;
    occ = vRegion < 0.5 ? max(o.r, o.g) : o.g;
  }
  float a = edge * (1.0 - occ) * uOpacity;
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : c.rgb;
  outColor = vec4(rgb * uGain * a, a);
}`;

interface GarmentGpu {
  vao: WebGLVertexArrayObject;
  pos: WebGLBuffer;
  buffers: WebGLBuffer[];
  tex: WebGLTexture;
  count: number;
}

export class GarmentRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly occTex: WebGLTexture;
  private readonly u: Record<string, WebGLUniformLocation | null>;
  private garments: GarmentGpu[] = [];
  private occSize: [number, number] = [0, 0];
  private hasOcc = false;
  private gain: [number, number, number] = [1, 1, 1];

  /** Devuelve null si el navegador no tiene WebGL2: el componente usa el respaldo 2D. */
  static create(canvas: HTMLCanvasElement | OffscreenCanvas): GarmentRenderer | null {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    try {
      return new GarmentRenderer(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.bindAttribLocation(p, 1, 'aUv');
    gl.bindAttribLocation(p, 2, 'aRegion');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
    this.program = p;
    this.u = Object.fromEntries(['uSize', 'uOffset', 'uTex', 'uOcc', 'uUseOcc', 'uShadow', 'uGain', 'uOpacity'].map((n) => [n, gl.getUniformLocation(p, n)]));
    this.occTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Sube texturas y mallas. Las prendas se dibujan en el orden recibido (capas). */
  setGarments(list: { image: TexImageSource; mesh: Mesh }[]): void {
    const gl = this.gl;
    this.disposeGarments();
    this.garments = list.map(({ image, mesh }) => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const pos = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.rest.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const buffers: WebGLBuffer[] = [];
      const staticBuf = (data: Float32Array, loc: number, size: number) => {
        const b = gl.createBuffer()!;
        buffers.push(b);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      staticBuf(mesh.uv, 1, 2);
      staticBuf(mesh.region, 2, 1);
      const idx = gl.createBuffer()!;
      buffers.push(idx);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, pos, buffers, tex, count: mesh.indices.length };
    });
  }

  /** Máscara RG de oclusión (ver occlusion.ts), en coordenadas normalizadas del lienzo. */
  setOcclusion(rg: Uint8Array | null, width: number, height: number): void {
    const gl = this.gl;
    this.hasOcc = !!rg;
    if (!rg) return;
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (this.occSize[0] !== width || this.occSize[1] !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, width, height, 0, gl.RG, gl.UNSIGNED_BYTE, rg);
      this.occSize = [width, height];
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RG, gl.UNSIGNED_BYTE, rg);
    }
  }

  /** Ganancia RGB para igualar la luz de la escena (1 = sin cambio). */
  setLight(gain: [number, number, number]): void {
    this.gain = gain;
  }

  /**
   * Dibuja un fotograma. `positions[i]` son los vértices ya deformados de la prenda i (px
   * del lienzo) o null si esa prenda no se puede colocar en este fotograma.
   */
  draw(positions: (Float32Array | null)[], width: number, height: number, shadowPx = 6): void {
    const gl = this.gl;
    if (gl.canvas.width !== width || gl.canvas.height !== height) {
      gl.canvas.width = width;
      gl.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.u['uSize'], width, height);
    gl.uniform1i(this.u['uTex'], 0);
    gl.uniform1i(this.u['uOcc'], 1);
    gl.uniform1i(this.u['uUseOcc'], this.hasOcc ? 1 : 0);
    gl.uniform3f(this.u['uGain'], ...this.gain);
    gl.uniform1f(this.u['uOpacity'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.occTex);

    this.garments.forEach((g, i) => {
      const pos = positions[i];
      if (!pos) return;
      gl.bindVertexArray(g.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, g.tex);
      gl.uniform1i(this.u['uShadow'], 1);
      gl.uniform2f(this.u['uOffset'], shadowPx * 0.4, shadowPx);
      gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
      gl.uniform1i(this.u['uShadow'], 0);
      gl.uniform2f(this.u['uOffset'], 0, 0);
      gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.bindVertexArray(null);
  }

  clear(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private disposeGarments(): void {
    const gl = this.gl;
    for (const g of this.garments) {
      gl.deleteVertexArray(g.vao);
      gl.deleteBuffer(g.pos);
      g.buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteTexture(g.tex);
    }
    this.garments = [];
  }

  dispose(): void {
    this.disposeGarments();
    this.gl.deleteTexture(this.occTex);
    this.gl.deleteProgram(this.program);
  }
}
