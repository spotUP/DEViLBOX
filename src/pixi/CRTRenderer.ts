/**
 * CRTRenderer — Full-screen CRT post-processing as a PixiJS v8 Filter.
 *
 * Extends Filter so PixiJS handles the RenderTexture internally:
 *   1. PixiJS renders the target container to a temp RT.
 *   2. Our fragment shader samples that RT and applies CRT effects.
 *   3. PixiJS composites the result to screen.
 *
 * No extra renderer.render() call — avoids Yoga layout conflicts
 * that occurred when manually rendering the scene container mid-frame.
 *
 * Usage:
 *   const crt = new CRTRenderer();
 *   container.filters = [crt];          // enable
 *   crt.updateParams(time, crtParams);  // call each tick
 *   container.filters = [];             // disable
 */

import { Filter, GlProgram } from 'pixi.js';
import type { CRTParams } from '@stores/useSettingsStore';

// ─── GLSL ─────────────────────────────────────────────────────────────────────

// Standard PixiJS v8 filter vertex shader.
// Provides vTextureCoord to the fragment shader via the filter system's
// uInputSize / uOutputFrame / uOutputTexture uniforms.
const VERT = /* glsl */ `
  in vec2 aPosition;
  out vec2 vTextureCoord;
  out vec2 vUVScale;

  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

  vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
  }

  void main(void) {
    gl_Position = filterVertexPosition();
    vUVScale = uOutputFrame.zw * uInputSize.zw;
    vTextureCoord = aPosition * vUVScale;
  }
`;

// CRT fragment shader — adapted from Reference Code/webgl-crt-shader-main/CRTShader.js.
// Uses vTextureCoord (from PixiJS filter system) instead of vUV.
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

  in vec2 vTextureCoord;
  in vec2 vUVScale;
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
    // Normalize vTextureCoord to screen-space [0,1]×[0,1].
    // When the stage bounding box is larger than the viewport (e.g. windows
    // positioned off-screen on the infinite canvas), the input RT is oversized
    // and vTextureCoord only spans a fraction of [0,1].  Dividing by vUVScale
    // gives a UV that always covers exactly the visible screen.
    vec2 uv = vTextureCoord / vUVScale;

    if (uCurvature > 0.001) {
      uv = curveRemapUV(uv, uCurvature);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0);
        return;
      }
    }

    // Convert screen UV back to texture UV for sampling.
    vec2 sampleUV = uv * vUVScale;

    vec4 pixel = texture(uTexture, sampleUV);

    if (uBloomIntensity > 0.001) {
      float lum = dot(pixel.rgb, LUMA);
      if (lum > uBloomThreshold * BLOOM_THRESHOLD_FACTOR) {
        vec4 bloom = sampleBloom(uTexture, sampleUV, 0.005 * vUVScale.x, pixel);
        bloom.rgb *= uBrightness;
        float bloomLum = dot(bloom.rgb, LUMA);
        float factor = uBloomIntensity * max(0.0, (bloomLum - uBloomThreshold) * BLOOM_FACTOR_MULT);
        pixel.rgb += bloom.rgb * factor;
      }
    }

    if (uRgbShift > 0.005) {
      float shift = uRgbShift * RGB_SHIFT_SCALE * vUVScale.x;
      pixel.r += texture(uTexture, vec2(sampleUV.x + shift, sampleUV.y)).r * RGB_SHIFT_INTENSITY;
      pixel.b += texture(uTexture, vec2(sampleUV.x - shift, sampleUV.y)).b * RGB_SHIFT_INTENSITY;
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

export class CRTRenderer extends Filter {
  private readonly _u: Record<string, UniformEntry>;

  constructor() {
    const _u: Record<string, UniformEntry> = {
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

    const glProgram = new GlProgram({ vertex: VERT, fragment: FRAG });
    super({ glProgram, resources: { uniforms: _u as any } });

    this._u = _u;
  }

  /** Update all CRT uniforms. Call each tick while enabled. */
  updateParams(time: number, params: CRTParams): void {
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
  }
}
