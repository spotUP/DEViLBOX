/**
 * CRTRenderer — Full-screen CRT post-processing shader.
 *
 * Pattern: identical to WorkbenchTiltRenderer.
 *   1. Render the scene container to a RenderTexture (CRT mesh excluded via renderable=false).
 *   2. Show the CRT mesh with uniforms updated from CRTParams.
 *   3. Pixi's normal render draws the CRT mesh to screen.
 *   4. Scene container uses renderable=false (not visible=false) so pointer events still work.
 *
 * Call renderFrame() each tick (BEFORE Pixi's screen render — useTick runs at NORMAL priority,
 * Pixi renders at LOW priority).
 * Call setEnabled(false) to restore normal rendering without CRT.
 */

import type { Application, Container as ContainerType } from 'pixi.js';
import {
  RenderTexture,
  Geometry,
  Buffer,
  BufferUsage,
  Mesh,
  Shader,
  GlProgram,
} from 'pixi.js';
import type { CRTParams } from '@stores/useSettingsStore';

// ─── GLSL ─────────────────────────────────────────────────────────────────────

// Clip-space quad vertex shader (identical to WorkbenchTilt).
const VERT = /* glsl */ `#version 300 es
  precision highp float;
  in vec2 aPosition;
  in vec2 aUV;
  out vec2 vUV;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vUV = aUV;
  }
`;

// CRT fragment shader — adapted from Reference Code/webgl-crt-shader-main/CRTShader.js.
// Changes from the original:
//   - #version 300 es header
//   - varying vec2 vUv  →  in vec2 vUV
//   - uniform tDiffuse  →  uniform uTexture
//   - texture2D(...)    →  texture(...)
//   - gl_FragColor      →  out vec4 fragColor
//   - uniform names prefixed with 'u'
const FRAG = /* glsl */ `#version 300 es
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D uTexture;
  uniform float uScanlineIntensity;
  uniform float uScanlineCount;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uBloomIntensity;
  uniform float uBloomThreshold;
  uniform float uRgbShift;
  uniform float uAdaptiveIntensity;
  uniform float uVignetteStrength;
  uniform float uCurvature;
  uniform float uFlickerStrength;

  in vec2 vUV;
  out vec4 fragColor;

  const float PI = 3.14159265;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  const float BLOOM_THRESHOLD_FACTOR = 0.5;
  const float BLOOM_FACTOR_MULT = 1.5;
  const float RGB_SHIFT_SCALE = 0.005;
  const float RGB_SHIFT_INTENSITY = 0.08;

  vec2 curveRemapUV(vec2 uv, float curvature) {
    vec2 coords = uv * 2.0 - 1.0;
    float dist = dot(coords, coords);
    coords = coords * (1.0 + dist * curvature * 0.25);
    return coords * 0.5 + 0.5;
  }

  vec4 sampleBloom(sampler2D tex, vec2 uv, float radius, vec4 center) {
    vec2 o = vec2(radius);
    vec4 c = center * 0.4;
    vec4 cross_ = (
      texture(tex, uv + vec2(o.x, 0.0)) +
      texture(tex, uv - vec2(o.x, 0.0)) +
      texture(tex, uv + vec2(0.0, o.y)) +
      texture(tex, uv - vec2(0.0, o.y))
    ) * 0.15;
    return c + cross_;
  }

  float vignetteApprox(vec2 uv, float strength) {
    vec2 v = uv * 2.0 - 1.0;
    float dist = max(abs(v.x), abs(v.y));
    return 1.0 - dist * dist * strength;
  }

  void main() {
    vec2 uv = vUV;

    if (uCurvature > 0.001) {
      uv = curveRemapUV(uv, uCurvature);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0);
        return;
      }
    }

    vec4 pixel = texture(uTexture, uv);

    if (uBloomIntensity > 0.001) {
      float lum = dot(pixel.rgb, LUMA);
      if (lum > uBloomThreshold * BLOOM_THRESHOLD_FACTOR) {
        vec4 bloom = sampleBloom(uTexture, uv, 0.005, pixel);
        bloom.rgb *= uBrightness;
        float bloomLum = dot(bloom.rgb, LUMA);
        float factor = uBloomIntensity * max(0.0, (bloomLum - uBloomThreshold) * BLOOM_FACTOR_MULT);
        pixel.rgb += bloom.rgb * factor;
      }
    }

    if (uRgbShift > 0.005) {
      float shift = uRgbShift * RGB_SHIFT_SCALE;
      pixel.r += texture(uTexture, vec2(uv.x + shift, uv.y)).r * RGB_SHIFT_INTENSITY;
      pixel.b += texture(uTexture, vec2(uv.x - shift, uv.y)).b * RGB_SHIFT_INTENSITY;
    }

    pixel.rgb *= uBrightness;

    float luminance = dot(pixel.rgb, LUMA);
    pixel.rgb = (pixel.rgb - 0.5) * uContrast + 0.5;
    pixel.rgb = mix(vec3(luminance), pixel.rgb, uSaturation);

    float mask = 1.0;

    if (uScanlineIntensity > 0.001) {
      float scanY = uv.y * uScanlineCount;
      float pattern = abs(sin(scanY * PI));
      float adaptive = 1.0;
      if (uAdaptiveIntensity > 0.001) {
        float yp = sin(uv.y * 30.0) * 0.5 + 0.5;
        adaptive = 1.0 - yp * uAdaptiveIntensity * 0.2;
      }
      mask *= 1.0 - pattern * uScanlineIntensity * adaptive;
    }

    if (uFlickerStrength > 0.001) {
      mask *= 1.0 + sin(uTime * 110.0) * uFlickerStrength;
    }

    if (uVignetteStrength > 0.001) {
      mask *= vignetteApprox(uv, uVignetteStrength);
    }

    pixel.rgb *= mask;
    fragColor = pixel;
  }
`;

// ─── CRTRenderer ──────────────────────────────────────────────────────────────

type UniformEntry = { value: number; type: 'f32' };

export class CRTRenderer {
  private readonly app: Application;
  private readonly sceneContainer: ContainerType;
  private readonly rt: RenderTexture;
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly _u: Record<string, UniformEntry>;

  constructor(
    app: Application,
    sceneContainer: ContainerType,
    width: number,
    height: number,
  ) {
    this.app = app;
    this.sceneContainer = sceneContainer;

    // ── RenderTexture ─────────────────────────────────────────────────────────
    this.rt = RenderTexture.create({ width, height });

    // ── Quad geometry (full-screen, clip space) ───────────────────────────────
    // Same layout as WorkbenchTilt: 4 vertices, positions + UVs separate buffers.
    const posBuffer = new Buffer({
      data: new Float32Array([
        -1,  1,  // TL
         1,  1,  // TR
         1, -1,  // BR
        -1, -1,  // BL
      ]),
      usage: BufferUsage.VERTEX,
    });

    const uvBuffer = new Buffer({
      data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      usage: BufferUsage.VERTEX,
    });

    const indexBuffer = new Buffer({
      data: new Uint32Array([0, 1, 2, 0, 2, 3]),
      usage: BufferUsage.INDEX,
    });

    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: posBuffer, format: 'float32x2', stride: 8, offset: 0 },
        aUV:       { buffer: uvBuffer,  format: 'float32x2', stride: 8, offset: 0 },
      },
      indexBuffer,
    });

    // ── Uniform data ──────────────────────────────────────────────────────────
    // PixiJS v8 wraps a plain object into a UniformGroup.
    // Mutating .value in place causes PixiJS to re-upload on next render.
    this._u = {
      uTime:              { value: 0.0,  type: 'f32' },
      uScanlineIntensity: { value: 0.15, type: 'f32' },
      uScanlineCount:     { value: 400,  type: 'f32' },
      uAdaptiveIntensity: { value: 0.5,  type: 'f32' },
      uBrightness:        { value: 1.1,  type: 'f32' },
      uContrast:          { value: 1.05, type: 'f32' },
      uSaturation:        { value: 1.1,  type: 'f32' },
      uBloomIntensity:    { value: 0.2,  type: 'f32' },
      uBloomThreshold:    { value: 0.5,  type: 'f32' },
      uRgbShift:          { value: 0.0,  type: 'f32' },
      uVignetteStrength:  { value: 0.3,  type: 'f32' },
      uCurvature:         { value: 0.15, type: 'f32' },
      uFlickerStrength:   { value: 0.01, type: 'f32' },
    };

    // ── Shader ────────────────────────────────────────────────────────────────
    const glProgram = new GlProgram({ vertex: VERT, fragment: FRAG });
    const shader = new Shader({
      glProgram,
      resources: {
        uTexture: this.rt.source,
        uniforms:  this._u as any,
      },
    });

    // ── Mesh ──────────────────────────────────────────────────────────────────
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.renderable = false;  // hidden until renderFrame() is called
    this.mesh.zIndex = 10000;      // above WorkbenchTilt (9000) and all other layers
    app.stage.addChild(this.mesh);
  }

  /**
   * Capture scene → RT, update uniforms, expose mesh.
   * Call inside useTick (NORMAL priority) — Pixi renders to screen at LOW priority afterward.
   */
  renderFrame(time: number, params: CRTParams): void {
    // 1. Restore scene for RT capture; exclude CRT mesh from RT.
    this.sceneContainer.renderable = true;
    this.mesh.renderable = false;
    this.app.renderer.render({ container: this.sceneContainer, target: this.rt, clear: true });

    // 2. Update uniforms.
    const u = this._u;
    u.uTime.value              = time;
    u.uScanlineIntensity.value = params.scanlineIntensity;
    u.uScanlineCount.value     = params.scanlineCount;
    u.uAdaptiveIntensity.value = params.adaptiveIntensity;
    u.uBrightness.value        = params.brightness;
    u.uContrast.value          = params.contrast;
    u.uSaturation.value        = params.saturation;
    u.uBloomIntensity.value    = params.bloomIntensity;
    u.uBloomThreshold.value    = params.bloomThreshold;
    u.uRgbShift.value          = params.rgbShift;
    u.uVignetteStrength.value  = params.vignetteStrength;
    u.uCurvature.value         = params.curvature;
    u.uFlickerStrength.value   = params.flickerStrength;

    // 3. Hide scene from screen render; show CRT mesh.
    //    visible stays true → EventSystem still delivers pointer events.
    this.sceneContainer.renderable = false;
    this.mesh.renderable = true;
  }

  /** Restore normal rendering (no CRT). Safe to call every tick when disabled. */
  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.sceneContainer.renderable = true;
      this.mesh.renderable = false;
    }
  }

  /** Call on canvas resize. */
  resize(width: number, height: number): void {
    this.rt.resize(width, height);
  }

  destroy(): void {
    this.app.stage.removeChild(this.mesh);
    this.mesh.destroy();
    this.rt.destroy(true);
  }
}
