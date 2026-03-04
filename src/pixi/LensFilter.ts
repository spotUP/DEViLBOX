/**
 * LensFilter — Global lens distortion post-processing as a PixiJS v8 Filter.
 *
 * Applies barrel/pincushion distortion (fish-eye), chromatic aberration,
 * and vignette to the entire stage. Separate from CRTRenderer — can stack.
 *
 * Usage:
 *   const lens = new LensFilter();
 *   container.filters = [lens];        // enable (or push alongside CRT)
 *   lens.updateParams(lensParams);     // call each tick
 *   container.filters = [];            // disable
 */

import { Filter, GlProgram } from 'pixi.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LensParams {
  barrel:    number;  // 0–1  barrel distortion (0=none, 0.3=mild, 1=extreme fish-eye)
  chromatic: number;  // 0–1  chromatic aberration (RGB fringing at edges)
  vignette:  number;  // 0–1  edge darkening
}

export type LensPreset = 'off' | 'subtle' | 'fisheye' | 'security' | 'dome' | 'pincushion';

export const LENS_PRESETS: Record<LensPreset, { label: string; params: LensParams }> = {
  off:        { label: 'Off',          params: { barrel: 0,    chromatic: 0,    vignette: 0 } },
  subtle:     { label: 'Subtle',       params: { barrel: 0.12, chromatic: 0.15, vignette: 0.25 } },
  fisheye:    { label: 'Fish Eye',     params: { barrel: 0.55, chromatic: 0.35, vignette: 0.40 } },
  security:   { label: 'Security Cam', params: { barrel: 0.35, chromatic: 0.50, vignette: 0.70 } },
  dome:       { label: 'Dome',         params: { barrel: 0.80, chromatic: 0.20, vignette: 0.50 } },
  pincushion: { label: 'Pincushion',   params: { barrel: -0.3, chromatic: 0.10, vignette: 0.20 } },
};

export const LENS_PRESET_ORDER: LensPreset[] = ['off', 'subtle', 'fisheye', 'security', 'dome', 'pincushion'];

export const LENS_DEFAULT_PARAMS: LensParams = { barrel: 0, chromatic: 0, vignette: 0 };

// ─── GLSL ─────────────────────────────────────────────────────────────────────

// Standard PixiJS v8 filter vertex shader (same as CRTRenderer).
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

const FRAG = /* glsl */ `#version 300 es
  precision highp float;

  uniform sampler2D uTexture;
  uniform float uBarrel;
  uniform float uChromatic;
  uniform float uVignette;

  in vec2 vTextureCoord;
  in vec2 vUVScale;
  out vec4 fragColor;

  vec2 barrelDistort(vec2 uv, float k) {
    vec2 centered = uv * 2.0 - 1.0;
    float r2 = dot(centered, centered);
    // 4th-order barrel/pincushion: positive k = barrel, negative = pincushion
    centered *= 1.0 + k * r2 + k * 0.5 * r2 * r2;
    return centered * 0.5 + 0.5;
  }

  void main() {
    vec2 uv = vTextureCoord / vUVScale;

    if (abs(uBarrel) > 0.001) {
      uv = barrelDistort(uv, uBarrel);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
    }

    vec2 sampleUV = uv * vUVScale;
    vec4 pixel;

    if (uChromatic > 0.005) {
      // Chromatic aberration: offset R and B channels radially from center
      vec2 dir = (uv - 0.5) * uChromatic * 0.02;
      vec2 sR = (uv + dir) * vUVScale;
      vec2 sB = (uv - dir) * vUVScale;
      pixel = vec4(
        texture(uTexture, sR).r,
        texture(uTexture, sampleUV).g,
        texture(uTexture, sB).b,
        1.0
      );
    } else {
      pixel = texture(uTexture, sampleUV);
    }

    if (uVignette > 0.001) {
      vec2 v = uv * 2.0 - 1.0;
      float dist = dot(v, v);
      pixel.rgb *= 1.0 - dist * uVignette;
    }

    fragColor = pixel;
  }
`;

// ─── LensFilter ───────────────────────────────────────────────────────────────

type UniformEntry = { value: number; type: 'f32' };

export class LensFilter extends Filter {
  private readonly _u: Record<string, UniformEntry>;

  constructor() {
    const _u: Record<string, UniformEntry> = {
      uBarrel:    { value: 0, type: 'f32' },
      uChromatic: { value: 0, type: 'f32' },
      uVignette:  { value: 0, type: 'f32' },
    };

    const glProgram = new GlProgram({ vertex: VERT, fragment: FRAG });
    super({ glProgram, resources: { uniforms: _u as any } });

    this._u = _u;
  }

  updateParams(params: LensParams): void {
    this._u.uBarrel.value    = params.barrel;
    this._u.uChromatic.value = params.chromatic;
    this._u.uVignette.value  = params.vignette;
  }
}
