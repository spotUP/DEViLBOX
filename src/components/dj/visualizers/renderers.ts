/**
 * WebGL VJ Visualizer Renderers
 *
 * Each renderer owns a WebGL program (vertex + fragment shaders) and renders
 * audio-reactive visuals via GLSL. All renderers share a fullscreen quad mesh.
 *
 * Architecture: compile once → upload audio uniforms each frame → draw quad.
 */

import type { AudioData, VisualizerState } from './types';

// ─── Shared WebGL helpers ──────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// Fullscreen triangle (covers clip space with a single triangle, no quad seam)
const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  float x = float((gl_VertexID & 1) << 2);
  float y = float((gl_VertexID & 2) << 1);
  vUv = vec2(x * 0.5, y * 0.5);
  gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
`;

// ─── Renderer state (compiled programs + textures, cached per GL context) ──────

export interface RendererCache {
  gl: WebGL2RenderingContext;
  programs: Map<string, WebGLProgram>;
  fftTexture: WebGLTexture;
  waveTexture: WebGLTexture;
  vao: WebGLVertexArrayObject;
}

export function createRendererCache(gl: WebGL2RenderingContext): RendererCache {
  const vao = gl.createVertexArray()!;

  // 1D textures for audio data (uploaded every frame)
  const fftTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, fftTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const waveTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, waveTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { gl, programs: new Map(), fftTexture, waveTexture, vao };
}

export function destroyRendererCache(cache: RendererCache): void {
  const { gl } = cache;
  cache.programs.forEach((p) => gl.deleteProgram(p));
  gl.deleteTexture(cache.fftTexture);
  gl.deleteTexture(cache.waveTexture);
  gl.deleteVertexArray(cache.vao);
}

function getOrCreateProgram(cache: RendererCache, key: string, fsSrc: string): WebGLProgram {
  let prog = cache.programs.get(key);
  if (!prog) {
    prog = createProgram(cache.gl, FULLSCREEN_VS, fsSrc);
    cache.programs.set(key, prog);
  }
  return prog;
}

/** Upload audio data textures + set common uniforms, then draw fullscreen triangle */
function drawFullscreen(
  cache: RendererCache,
  prog: WebGLProgram,
  audio: AudioData,
  time: number,
  w: number,
  h: number,
): void {
  const { gl } = cache;
  gl.useProgram(prog);

  // Upload FFT as 1D texture (1024x1, R32F)
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cache.fftTexture);
  // Normalize FFT from dB (-100..0) to 0..1
  const fftNorm = new Float32Array(audio.fft.length);
  for (let i = 0; i < audio.fft.length; i++) {
    fftNorm[i] = Math.max(0, (audio.fft[i] + 100) / 100);
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, audio.fft.length, 1, 0, gl.RED, gl.FLOAT, fftNorm);
  gl.uniform1i(gl.getUniformLocation(prog, 'uFFT'), 0);

  // Upload waveform as 1D texture (256x1, R32F)
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, cache.waveTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, audio.waveform.length, 1, 0, gl.RED, gl.FLOAT, audio.waveform);
  gl.uniform1i(gl.getUniformLocation(prog, 'uWaveform'), 1);

  // Common uniforms
  gl.uniform1f(gl.getUniformLocation(prog, 'uTime'), time);
  gl.uniform2f(gl.getUniformLocation(prog, 'uResolution'), w, h);
  gl.uniform1f(gl.getUniformLocation(prog, 'uRms'), audio.rms);
  gl.uniform1f(gl.getUniformLocation(prog, 'uPeak'), audio.peak);
  gl.uniform1f(gl.getUniformLocation(prog, 'uBass'), audio.bassEnergy);
  gl.uniform1f(gl.getUniformLocation(prog, 'uMid'), audio.midEnergy);
  gl.uniform1f(gl.getUniformLocation(prog, 'uHigh'), audio.highEnergy);

  gl.bindVertexArray(cache.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. SPECTRUM BARS — Neon reflection bars with bloom glow
// ═══════════════════════════════════════════════════════════════════════════════

const SPECTRUM_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFFT;
uniform float uTime;
uniform vec2 uResolution;
uniform float uRms;
uniform float uBass;

// Design system colors
const vec3 RED    = vec3(0.937, 0.267, 0.267);
const vec3 ORANGE = vec3(0.976, 0.451, 0.086);
const vec3 AMBER  = vec3(0.961, 0.620, 0.043);
const vec3 GREEN  = vec3(0.063, 0.725, 0.506);

vec3 barColor(float t) {
  // Green at bottom → Amber → Orange → Red at top
  if (t < 0.33) return mix(GREEN, AMBER, t / 0.33);
  if (t < 0.66) return mix(AMBER, ORANGE, (t - 0.33) / 0.33);
  return mix(ORANGE, RED, (t - 0.66) / 0.34);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;

  // 64 bars with logarithmic frequency mapping
  float numBars = 64.0;
  float barIdx = floor(uv.x * numBars);
  float barCenter = (barIdx + 0.5) / numBars;

  // Logarithmic mapping: more bars for low frequencies
  float logPos = pow(barCenter, 2.0);
  float fftVal = texture(uFFT, vec2(logPos, 0.5)).r;
  // Boost and smooth
  fftVal = pow(fftVal, 0.7) * 1.4;

  float barWidth = 0.7 / numBars;
  float barX = fract(uv.x * numBars);

  // Mirror around center line
  float centerY = 0.5;
  float dist = abs(uv.y - centerY);
  float barHeight = fftVal * 0.45;

  // Bar body
  float inBar = step(dist, barHeight) * step(0.15, barX) * step(barX, 0.85);

  // Color gradient based on height
  float heightRatio = dist / max(barHeight, 0.001);
  vec3 col = barColor(1.0 - heightRatio);

  // Reflection below center (dimmer)
  float isBelow = step(uv.y, centerY);
  float reflectionFade = isBelow * 0.35 * (1.0 - dist / 0.45);

  // Glow around bars
  float glow = exp(-dist * dist * 80.0 / max(fftVal * fftVal, 0.01)) * fftVal * 0.3;
  vec3 glowCol = barColor(logPos);

  // Peak hold dots
  float peakDist = abs(dist - barHeight);
  float peakDot = smoothstep(0.008, 0.002, peakDist) * step(0.15, barX) * step(barX, 0.85);
  vec3 peakCol = vec3(1.0);

  // Background pulse
  float bgPulse = uBass * 0.03;

  vec3 finalCol = vec3(0.043, 0.035, 0.035) * (1.0 + bgPulse);
  finalCol += col * inBar * (isBelow > 0.5 ? reflectionFade : 1.0);
  finalCol += glowCol * glow;
  finalCol += peakCol * peakDot * 0.8;

  // Scanline effect
  float scanline = 0.95 + 0.05 * sin(uv.y * uResolution.y * 1.5);
  finalCol *= scanline;

  fragColor = vec4(finalCol, 1.0);
}
`;

export function renderSpectrumBars(
  cache: RendererCache,
  audio: AudioData,
  _state: VisualizerState,
  time: number,
  w: number,
  h: number,
): void {
  const prog = getOrCreateProgram(cache, 'spectrumBars', SPECTRUM_FS);
  drawFullscreen(cache, prog, audio, time, w, h);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 2. CIRCULAR SPECTRUM — Radial frequency display with pulsing core
// ═══════════════════════════════════════════════════════════════════════════════

const CIRCULAR_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFFT;
uniform float uTime;
uniform vec2 uResolution;
uniform float uRms;
uniform float uPeak;
uniform float uBass;
uniform float uMid;
uniform float uHigh;

const float PI = 3.14159265;
const float TAU = 6.28318530;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

void main() {
  vec2 center = vec2(0.5);
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (vUv - center) * vec2(aspect, 1.0);
  float dist = length(p);
  float angle = atan(p.y, p.x);
  float normAngle = (angle + PI) / TAU;

  // Inner pulsing core
  float coreRadius = 0.08 + uRms * 0.06;
  float coreDist = dist / coreRadius;
  float core = smoothstep(1.2, 0.0, coreDist);
  vec3 coreCol = vec3(0.063, 0.725, 0.506) * core * (1.5 + uRms);

  // Secondary core glow
  float innerGlow = exp(-coreDist * coreDist * 2.0) * 0.4;
  coreCol += vec3(0.2, 0.9, 0.6) * innerGlow;

  // Radial FFT bars (128 segments)
  float segments = 128.0;
  float segAngle = floor(normAngle * segments) / segments;
  float fftVal = texture(uFFT, vec2(pow(segAngle, 1.5), 0.5)).r;
  fftVal = pow(fftVal, 0.6) * 1.5;

  float barStart = coreRadius + 0.02;
  float barEnd = barStart + fftVal * 0.35;

  float inRadialBar = step(barStart, dist) * step(dist, barEnd);
  float segFract = fract(normAngle * segments);
  inRadialBar *= step(0.08, segFract) * step(segFract, 0.92);

  // Hue rotates around circle + over time
  float hue = fract(normAngle + uTime * 0.05);
  vec3 barCol = hsl2rgb(hue, 0.9, 0.55) * inRadialBar;
  float barBright = 1.0 - smoothstep(barStart, barEnd, dist) * 0.5;
  barCol *= barBright;

  // Outer halo ring on peaks
  float haloDist = abs(dist - (coreRadius + 0.38));
  float haloGlow = exp(-haloDist * haloDist * 200.0) * uPeak * 2.0;
  vec3 haloCol = vec3(1.0, 0.85, 0.7) * haloGlow;

  // Rotating particle ring
  float ringAngle = angle + uTime * 0.8;
  float ringPulse = sin(ringAngle * 12.0) * 0.5 + 0.5;
  float ringDist = abs(dist - (coreRadius + 0.01));
  float ring = exp(-ringDist * ringDist * 3000.0) * ringPulse * uMid * 1.5;
  vec3 ringCol = hsl2rgb(fract(normAngle + uTime * 0.1), 1.0, 0.6) * ring;

  // Background radial glow
  float bgGlow = exp(-dist * dist * 3.0) * uRms * 0.15;

  vec3 finalCol = vec3(0.043, 0.035, 0.035);
  finalCol += vec3(bgGlow * 0.2, bgGlow * 0.5, bgGlow * 0.3);
  finalCol += coreCol;
  finalCol += barCol;
  finalCol += haloCol;
  finalCol += ringCol;

  fragColor = vec4(finalCol, 1.0);
}
`;

export function renderCircularSpectrum(
  cache: RendererCache,
  audio: AudioData,
  _state: VisualizerState,
  time: number,
  w: number,
  h: number,
): void {
  const prog = getOrCreateProgram(cache, 'circularSpectrum', CIRCULAR_FS);
  drawFullscreen(cache, prog, audio, time, w, h);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 3. WAVEFORM TERRAIN — Joy Division / Unknown Pleasures style with depth
// ═══════════════════════════════════════════════════════════════════════════════

const TERRAIN_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uWaveform;
uniform float uTime;
uniform vec2 uResolution;
uniform float uRms;
uniform float uBass;

void main() {
  vec2 uv = vUv;

  // Create terrain rows (40 lines, back to front with perspective)
  float numRows = 40.0;
  vec3 col = vec3(0.043, 0.035, 0.035);

  for (float i = 0.0; i < 40.0; i++) {
    float row = i / numRows;
    // Perspective: rows further back are higher and smaller
    float yBase = 0.15 + row * 0.7;
    float amplitude = (0.04 + row * 0.08) * (1.0 + uBass * 0.5);

    // Sample waveform at this x position with time offset per row
    float waveX = uv.x;
    float timeOffset = row * 0.3 + uTime * 0.2;
    float wave = texture(uWaveform, vec2(fract(waveX + timeOffset * 0.1), 0.5)).r;

    // Add some harmonic richness
    float wave2 = texture(uWaveform, vec2(fract(waveX * 2.0 + timeOffset * 0.05), 0.5)).r;
    wave = wave * 0.7 + wave2 * 0.3;
    wave *= amplitude;

    float yPos = yBase + wave;
    float dist = uv.y - yPos;

    // Mountain fill (occlusion): everything below this line and above previous lines
    float fill = smoothstep(0.0, -0.003, dist);

    // Line stroke
    float line = exp(-dist * dist * 40000.0);

    // Brightness: newest (front/bottom) is brightest
    float brightness = (1.0 - row) * 0.8 + 0.2;
    brightness *= 1.0 + uRms * 0.5;

    // Fill with dark background (occlusion)
    col = mix(col, vec3(0.043, 0.035, 0.035), fill * step(row, numRows - 1.0));

    // Green-tinted lines
    vec3 lineCol = vec3(0.063, 0.725, 0.506) * brightness;
    // Add red/amber tint based on amplitude
    lineCol += vec3(0.9, 0.4, 0.1) * abs(wave) * 4.0;

    col += lineCol * line * brightness;
  }

  // Subtle vignette
  float vignette = 1.0 - dot((uv - 0.5) * 1.2, (uv - 0.5) * 1.2);
  col *= vignette;

  fragColor = vec4(col, 1.0);
}
`;

export function renderWaveformTerrain(
  cache: RendererCache,
  audio: AudioData,
  _state: VisualizerState,
  time: number,
  w: number,
  h: number,
): void {
  const prog = getOrCreateProgram(cache, 'waveformTerrain', TERRAIN_FS);
  drawFullscreen(cache, prog, audio, time, w, h);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 4. PLASMA FIELD — Psychedelic sine interference patterns modulated by audio
// ═══════════════════════════════════════════════════════════════════════════════

const PLASMA_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uHigh;

const vec3 RED    = vec3(0.937, 0.267, 0.267);
const vec3 ORANGE = vec3(0.976, 0.451, 0.086);
const vec3 AMBER  = vec3(0.961, 0.620, 0.043);
const vec3 GREEN  = vec3(0.063, 0.725, 0.506);
const vec3 CYAN   = vec3(0.1, 0.8, 0.9);

vec3 plasmaColor(float t) {
  t = fract(t);
  if (t < 0.2) return mix(RED, ORANGE, t / 0.2);
  if (t < 0.4) return mix(ORANGE, AMBER, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(AMBER, GREEN, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(GREEN, CYAN, (t - 0.6) / 0.2);
  return mix(CYAN, RED, (t - 0.8) / 0.2);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(aspect, 1.0);

  float speed = 0.3 + uRms * 2.0;
  float t = uTime * speed;

  // Four overlapping sine wave patterns
  float v1 = sin(p.x * 6.0 + t * 0.7 + uBass * 3.0);
  float v2 = sin(p.y * 8.0 - t * 0.5 + uMid * 2.0);
  float v3 = sin((p.x + p.y) * 5.0 + t * 0.9);
  float v4 = sin(length(p - vec2(aspect * 0.5, 0.5)) * 10.0 - t * 1.2 + uHigh * 4.0);

  // Additional distortion waves driven by audio
  float v5 = sin(p.x * 12.0 * (1.0 + uBass) + p.y * 8.0 + t * 1.5) * uMid;
  float v6 = cos(length(p - vec2(aspect * 0.3, 0.7)) * 15.0 + t * 2.0) * uHigh;

  float plasma = (v1 + v2 + v3 + v4 + v5 + v6) / 6.0;
  plasma = plasma * 0.5 + 0.5; // normalize to 0..1

  // Add bass pulse
  float pulse = uBass * 0.3 * sin(length(p - vec2(aspect * 0.5, 0.5)) * 3.0 - t * 3.0);
  plasma += pulse;

  vec3 col = plasmaColor(plasma + uTime * 0.02);

  // Brightness modulation
  col *= 0.7 + uRms * 0.6;

  // Vignette
  float vignette = 1.0 - dot((uv - 0.5) * 1.3, (uv - 0.5) * 1.3);
  col *= max(vignette, 0.0);

  fragColor = vec4(col, 1.0);
}
`;

export function renderPlasmaField(
  cache: RendererCache,
  audio: AudioData,
  _state: VisualizerState,
  time: number,
  w: number,
  h: number,
): void {
  const prog = getOrCreateProgram(cache, 'plasmaField', PLASMA_FS);
  drawFullscreen(cache, prog, audio, time, w, h);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 5. STARFIELD — Warp-speed stars flying toward camera, audio-reactive speed
// ═══════════════════════════════════════════════════════════════════════════════

const STARFIELD_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2 uResolution;
uniform float uRms;
uniform float uBass;
uniform float uPeak;
uniform float uMid;

// Hash function for procedural stars
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  float speed = 0.5 + uBass * 3.0 + uRms * 1.0;
  float t = uTime * speed;

  vec3 col = vec3(0.0);

  // Multiple star layers for depth
  for (float layer = 0.0; layer < 4.0; layer++) {
    float depth = 1.0 + layer * 0.5;
    float layerSpeed = t * (1.0 + layer * 0.3);

    // Tile space for star field
    vec2 starUv = uv * (5.0 + layer * 3.0);
    vec2 id = floor(starUv);
    vec2 f = fract(starUv) - 0.5;

    // Random star position within cell
    float h = hash(id + layer * 100.0);
    vec2 starPos = vec2(hash(id + 0.1 + layer * 100.0), hash(id + 0.2 + layer * 100.0)) - 0.5;

    // Only some cells have stars
    if (h > 0.6) {
      float starDist = length(f - starPos * 0.3);

      // Stars move toward camera (radial from center)
      vec2 dir = normalize(id + starPos - vec2(0.0));
      float movement = fract(h + layerSpeed * 0.1);

      // Size varies with depth and movement
      float size = (0.005 + h * 0.01) * (1.0 + movement * 2.0) / depth;
      size *= 1.0 + uRms * 0.5;

      // Star brightness with twinkle
      float brightness = smoothstep(size, size * 0.1, starDist);
      brightness *= 0.5 + 0.5 * sin(h * 100.0 + uTime * (2.0 + h * 3.0));

      // Motion streak toward camera
      float streak = exp(-starDist * 80.0 / max(movement * speed * 0.5, 0.01));
      streak *= movement * speed * 0.15;

      // Color varies by layer
      vec3 starCol;
      if (layer < 1.0) starCol = vec3(0.9, 0.95, 1.0);
      else if (layer < 2.0) starCol = vec3(0.5, 0.7, 1.0);
      else if (layer < 3.0) starCol = vec3(1.0, 0.6, 0.3);
      else starCol = vec3(0.3, 1.0, 0.5);

      col += starCol * (brightness + streak) / depth;
    }
  }

  // Warp flash on peaks
  float warpDist = length(uv);
  float warp = exp(-warpDist * warpDist * 8.0) * uPeak * 0.8;
  col += vec3(0.4, 0.6, 1.0) * warp;

  // Radial speed lines
  float angle = atan(uv.y, uv.x);
  float radialLines = pow(abs(sin(angle * 30.0 + uTime * 2.0)), 20.0);
  radialLines *= smoothstep(0.0, 0.5, warpDist) * uBass * 0.2;
  col += vec3(0.2, 0.4, 0.8) * radialLines;

  // Central nebula glow
  float nebula = exp(-warpDist * warpDist * 4.0) * 0.1;
  col += vec3(0.1, 0.2, 0.4) * nebula * (1.0 + uMid);

  // Very subtle vignette
  float vignette = 1.0 - warpDist * 0.4;
  col *= max(vignette, 0.3);

  fragColor = vec4(col, 1.0);
}
`;

export function renderStarfield(
  cache: RendererCache,
  audio: AudioData,
  _state: VisualizerState,
  time: number,
  w: number,
  h: number,
): void {
  const prog = getOrCreateProgram(cache, 'starfield', STARFIELD_FS);
  drawFullscreen(cache, prog, audio, time, w, h);
}


// ═══════════════════════════════════════════════════════════════════════════════
// 6. PARTICLE BURST — Explosive particle fireworks triggered by transients
// ═══════════════════════════════════════════════════════════════════════════════

const PARTICLE_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFFT;
uniform float uTime;
uniform vec2 uResolution;
uniform float uRms;
uniform float uBass;
uniform float uPeak;
uniform float uMid;
uniform float uHigh;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash1(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - vec2(0.5)) * vec2(aspect, 1.0);

  vec3 col = vec3(0.02, 0.015, 0.015);

  // Simulate multiple burst sources
  float burstIntensity = uPeak * 1.5 + uBass * 0.5;

  for (float burst = 0.0; burst < 6.0; burst++) {
    // Each burst has a different origin and timing
    float burstSeed = burst * 7.31;
    float burstTime = uTime * 1.5 + burstSeed;
    float burstPhase = fract(burstTime * 0.15);
    float burstAge = burstPhase;

    // Burst origin position (scattered around center)
    vec2 origin = vec2(
      sin(burstSeed * 2.4 + uTime * 0.3) * 0.25,
      cos(burstSeed * 1.7 + uTime * 0.2) * 0.15 + 0.1
    );

    // Particles per burst
    for (float i = 0.0; i < 30.0; i++) {
      float seed = hash1(i * 0.1 + burstSeed);
      float angle = seed * 6.28318;
      float speed = 0.3 + seed * 0.7;

      // Gravity + drag
      float particleAge = burstAge * (1.5 + burstIntensity);
      vec2 vel = vec2(cos(angle), sin(angle)) * speed;
      vec2 particlePos = origin + vel * particleAge;
      particlePos.y -= particleAge * particleAge * 0.4; // gravity

      float dist = length(p - particlePos);

      // Fade out with age
      float life = 1.0 - smoothstep(0.0, 1.0, burstAge * 1.5);
      life *= burstIntensity;

      // Ember glow
      float glow = exp(-dist * dist * 2000.0) * life;

      // Trailing spark
      float trail = exp(-dist * 300.0) * life * 0.3;

      // Color based on burst index
      vec3 burstCol;
      if (burst < 1.0) burstCol = vec3(0.937, 0.267, 0.267); // red
      else if (burst < 2.0) burstCol = vec3(0.976, 0.451, 0.086); // orange
      else if (burst < 3.0) burstCol = vec3(0.961, 0.620, 0.043); // amber
      else if (burst < 4.0) burstCol = vec3(0.063, 0.725, 0.506); // green
      else if (burst < 5.0) burstCol = vec3(0.3, 0.6, 1.0); // blue
      else burstCol = vec3(0.8, 0.3, 1.0); // purple

      // Hot white core
      vec3 coreCol = mix(burstCol, vec3(1.0), smoothstep(0.005, 0.0, dist));

      col += coreCol * glow + burstCol * trail;
    }
  }

  // Ground glow on beats
  float groundGlow = exp(-((uv.y - 0.95) * (uv.y - 0.95)) * 100.0) * uBass * 0.5;
  col += vec3(0.937, 0.267, 0.267) * groundGlow;

  // Ambient embers (always present)
  for (float i = 0.0; i < 20.0; i++) {
    float seed = hash1(i * 0.37);
    vec2 emberPos = vec2(
      sin(seed * 30.0 + uTime * 0.5 * (0.5 + seed)) * 0.4,
      mod(seed * 5.0 - uTime * 0.1 * (0.3 + seed), 1.5) - 0.5
    );
    float dist = length(p - emberPos);
    float flicker = 0.5 + 0.5 * sin(uTime * (3.0 + seed * 5.0));
    float ember = exp(-dist * dist * 1000.0) * flicker * uRms * 0.5;
    col += vec3(1.0, 0.5, 0.2) * ember;
  }

  // Subtle vignette
  float vignette = 1.0 - dot((uv - 0.5) * 1.4, (uv - 0.5) * 1.4);
  col *= max(vignette, 0.1);

  fragColor = vec4(col, 1.0);
}
`;

export function renderParticleBurst(
  cache: RendererCache,
  audio: AudioData,
  _state: VisualizerState,
  time: number,
  w: number,
  h: number,
): void {
  const prog = getOrCreateProgram(cache, 'particleBurst', PARTICLE_FS);
  drawFullscreen(cache, prog, audio, time, w, h);
}


// ═══════════════════════════════════════════════════════════════════════════════
// Renderer dispatch
// ═══════════════════════════════════════════════════════════════════════════════

import type { WebGLVisualizerMode } from './types';

type RendererFn = (
  cache: RendererCache,
  audio: AudioData,
  state: VisualizerState,
  time: number,
  w: number,
  h: number,
) => void;

export const RENDERERS: Record<WebGLVisualizerMode, RendererFn> = {
  spectrumBars: renderSpectrumBars,
  circularSpectrum: renderCircularSpectrum,
  waveformTerrain: renderWaveformTerrain,
  plasmaField: renderPlasmaField,
  starfield: renderStarfield,
  particleBurst: renderParticleBurst,
};
