/**
 * Built-in ISF preset collection for the VJ engine.
 *
 * Each preset is a self-contained ISF shader with audio-reactive inputs.
 * ISF format: JSON metadata in a comment block at the top of the GLSL source.
 *
 * Audio uniforms available to all presets:
 *   - audio_bass (0-1): Low frequency energy
 *   - audio_mid (0-1): Mid frequency energy
 *   - audio_high (0-1): High frequency energy
 *   - audio_level (0-1): Overall RMS level
 *   - audio_beat (0-1): Beat pulse (1 on beat, decays)
 */

import type { ISFPreset } from './ISFEngine';

// ─── Preset definitions ────────────────────────────────────────────────────────

const PLASMA_TUNNEL: ISFPreset = {
  name: 'Plasma Tunnel',
  author: 'DEViLBOX',
  category: 'Tunnel',
  description: 'Audio-reactive plasma tunnel with beat-synced zoom',
  fragmentShader: `/*{
  "DESCRIPTION": "Audio-reactive plasma tunnel",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Tunnel"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "zoom", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.1, "MAX": 3.0 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_high", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME * speed;
  float z = zoom + audio_bass * 0.5 + audio_beat * 0.3;
  
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  
  float tunnel = 1.0 / (radius * z + 0.001);
  float twist = angle / 3.14159 + tunnel * 0.5;
  
  float p1 = sin(twist * 6.0 + t * 2.0 + audio_mid * 3.0);
  float p2 = cos(tunnel * 4.0 - t * 1.5 + audio_high * 2.0);
  float p3 = sin(twist * 3.0 + tunnel * 2.0 + t);
  
  vec3 col = vec3(
    0.5 + 0.5 * sin(p1 * 2.0 + audio_bass * 3.0),
    0.5 + 0.5 * cos(p2 * 2.0 + 1.0),
    0.5 + 0.5 * sin(p3 * 2.0 + 2.0 + audio_high * 2.0)
  );
  
  col *= smoothstep(0.0, 0.3, radius);
  col *= 1.0 + audio_beat * 0.5;
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

const FRACTAL_WARP: ISFPreset = {
  name: 'Fractal Warp',
  author: 'DEViLBOX',
  category: 'Fractal',
  description: 'Warping fractal pattern driven by audio energy',
  fragmentShader: `/*{
  "DESCRIPTION": "Audio-reactive fractal warp",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Fractal"],
  "INPUTS": [
    { "NAME": "iterations", "TYPE": "float", "DEFAULT": 6.0, "MIN": 2.0, "MAX": 12.0 },
    { "NAME": "complexity", "TYPE": "float", "DEFAULT": 1.5, "MIN": 0.5, "MAX": 3.0 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_high", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_level", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME * 0.3;
  
  vec2 z = uv * (complexity + audio_bass * 0.5);
  float glow = 0.0;
  
  for (float i = 0.0; i < 12.0; i++) {
    if (i >= iterations) break;
    z = abs(z) / dot(z, z) - vec2(0.5 + 0.3 * sin(t + audio_mid), 0.5 + 0.3 * cos(t * 0.7));
    glow += exp(-3.0 * length(z));
  }
  
  glow /= iterations;
  glow *= 1.0 + audio_level * 2.0;
  
  vec3 col = vec3(
    glow * (1.5 + sin(t)),
    glow * (1.5 + sin(t + 2.094)),
    glow * (1.5 + sin(t + 4.189))
  );
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

const NEON_GRID: ISFPreset = {
  name: 'Neon Grid',
  author: 'DEViLBOX',
  category: 'Retro',
  description: 'Retro neon grid landscape with beat-synced pulse',
  fragmentShader: `/*{
  "DESCRIPTION": "Retro neon grid with audio reactivity",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Retro"],
  "INPUTS": [
    { "NAME": "grid_density", "TYPE": "float", "DEFAULT": 10.0, "MIN": 2.0, "MAX": 30.0 },
    { "NAME": "horizon", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.1, "MAX": 0.6 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = gl_FragCoord.xy / RENDERSIZE;
  float t = TIME;
  
  // Sky gradient
  vec3 sky = mix(
    vec3(0.0, 0.0, 0.1),
    vec3(0.1, 0.0, 0.2 + audio_mid * 0.1),
    uv.y
  );
  
  if (uv.y < horizon) {
    // Ground plane perspective
    float d = horizon / (horizon - uv.y + 0.001);
    float x = (uv.x - 0.5) * d;
    float z = d + t * 2.0;
    
    // Grid lines
    float gx = abs(fract(x * grid_density) - 0.5);
    float gz = abs(fract(z * 0.5) - 0.5);
    float grid = min(gx, gz);
    float line = smoothstep(0.02, 0.0, grid);
    
    // Glow color with audio
    vec3 glow = vec3(0.0, 0.8 + audio_bass * 0.2, 1.0) * line;
    glow *= 1.0 / (d * 0.3 + 0.5); // distance fade
    glow *= 1.0 + audio_beat * 1.5;
    
    gl_FragColor = vec4(sky + glow, 1.0);
  } else {
    // Sun
    vec2 sunPos = vec2(0.5, horizon + 0.15);
    float sunDist = length(uv - sunPos);
    float sun = smoothstep(0.12, 0.0, sunDist);
    vec3 sunColor = mix(vec3(1.0, 0.2, 0.5), vec3(1.0, 0.8, 0.2), sun);
    
    gl_FragColor = vec4(sky + sunColor * sun * (1.0 + audio_beat * 0.5), 1.0);
  }
}`,
};

const KALEIDOSCOPE: ISFPreset = {
  name: 'Kaleidoscope',
  author: 'DEViLBOX',
  category: 'Pattern',
  description: 'Symmetrical kaleidoscope pattern modulated by audio',
  fragmentShader: `/*{
  "DESCRIPTION": "Audio-reactive kaleidoscope",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Pattern"],
  "INPUTS": [
    { "NAME": "segments", "TYPE": "float", "DEFAULT": 6.0, "MIN": 2.0, "MAX": 16.0 },
    { "NAME": "rotation_speed", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 2.0 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_high", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME * rotation_speed;
  
  float angle = atan(uv.y, uv.x) + t;
  float radius = length(uv);
  
  // Kaleidoscope fold
  float seg = 3.14159 * 2.0 / segments;
  angle = mod(angle, seg);
  angle = abs(angle - seg * 0.5);
  
  vec2 p = vec2(cos(angle), sin(angle)) * radius;
  
  // Pattern
  float pattern = 0.0;
  pattern += sin(p.x * 10.0 + t * 3.0 + audio_bass * 5.0) * 0.5;
  pattern += cos(p.y * 8.0 - t * 2.0 + audio_mid * 4.0) * 0.5;
  pattern += sin((p.x + p.y) * 6.0 + t + audio_high * 3.0) * 0.3;
  
  vec3 col = vec3(
    0.5 + 0.5 * sin(pattern * 3.0 + 0.0),
    0.5 + 0.5 * sin(pattern * 3.0 + 2.094),
    0.5 + 0.5 * sin(pattern * 3.0 + 4.189)
  );
  
  col *= smoothstep(1.5, 0.0, radius);
  col *= 1.0 + audio_beat * 0.8;
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

const WAVEFORM_RINGS: ISFPreset = {
  name: 'Waveform Rings',
  author: 'DEViLBOX',
  category: 'Audio',
  description: 'Concentric rings pulsing with audio frequencies',
  fragmentShader: `/*{
  "DESCRIPTION": "Audio-reactive concentric rings",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Audio"],
  "INPUTS": [
    { "NAME": "ring_count", "TYPE": "float", "DEFAULT": 8.0, "MIN": 2.0, "MAX": 20.0 },
    { "NAME": "thickness", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.01, "MAX": 0.5 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_high", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_level", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME;
  float radius = length(uv);
  float angle = atan(uv.y, uv.x);
  
  vec3 col = vec3(0.0);
  
  for (float i = 0.0; i < 20.0; i++) {
    if (i >= ring_count) break;
    float r = (i + 1.0) / ring_count;
    
    // Modulate ring radius with audio
    float audioMod = 0.0;
    if (i < ring_count * 0.33) audioMod = audio_bass * 0.1;
    else if (i < ring_count * 0.66) audioMod = audio_mid * 0.08;
    else audioMod = audio_high * 0.06;
    
    float ringR = r * 0.8 + audioMod + sin(angle * 3.0 + t + i) * 0.02 * audio_level;
    float ring = smoothstep(thickness, 0.0, abs(radius - ringR));
    
    float hue = i / ring_count + t * 0.1;
    vec3 ringCol = vec3(
      0.5 + 0.5 * sin(hue * 6.283),
      0.5 + 0.5 * sin(hue * 6.283 + 2.094),
      0.5 + 0.5 * sin(hue * 6.283 + 4.189)
    );
    
    col += ringCol * ring * (0.5 + audio_beat * 0.5);
  }
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

const STARFIELD: ISFPreset = {
  name: 'Starfield Warp',
  author: 'DEViLBOX',
  category: 'Space',
  description: 'Warping starfield with audio-driven speed',
  fragmentShader: `/*{
  "DESCRIPTION": "Audio-reactive starfield warp",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Space"],
  "INPUTS": [
    { "NAME": "star_speed", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 4.0 },
    { "NAME": "star_density", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.1, "MAX": 1.0 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_level", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME * star_speed * (1.0 + audio_bass * 2.0);
  
  vec3 col = vec3(0.0);
  
  for (float layer = 0.0; layer < 4.0; layer++) {
    float depth = 1.0 + layer * 0.5;
    vec2 st = uv * depth + vec2(0.0, t / depth);
    
    vec2 cell = floor(st * 20.0);
    vec2 f = fract(st * 20.0);
    
    float h = hash(cell + layer * 100.0);
    
    if (h > (1.0 - star_density)) {
      vec2 starPos = vec2(hash(cell + 0.1), hash(cell + 0.2));
      float d = length(f - starPos);
      float brightness = smoothstep(0.1 / depth, 0.0, d);
      brightness *= 0.5 + 0.5 * sin(t * 2.0 + h * 6.283);
      brightness *= 1.0 + audio_beat * 1.0;
      
      float hue = h * 6.283 + t * 0.1;
      vec3 starCol = mix(vec3(0.8, 0.9, 1.0), vec3(
        0.5 + 0.5 * sin(hue),
        0.5 + 0.5 * sin(hue + 2.094),
        0.5 + 0.5 * sin(hue + 4.189)
      ), audio_level);
      
      col += starCol * brightness;
    }
  }
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

const LIQUID_METAL: ISFPreset = {
  name: 'Liquid Metal',
  author: 'DEViLBOX',
  category: 'Organic',
  description: 'Metallic liquid surface reacting to bass',
  fragmentShader: `/*{
  "DESCRIPTION": "Liquid metal surface driven by audio",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Organic"],
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "DEFAULT": 3.0, "MIN": 1.0, "MAX": 8.0 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_high", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME * 0.5;
  
  vec2 p = uv * scale;
  
  float n = 0.0;
  float amp = 1.0;
  float freq = 1.0;
  
  for (int i = 0; i < 5; i++) {
    float bass_mod = audio_bass * 0.3 * amp;
    n += amp * sin(p.x * freq + t + bass_mod) * cos(p.y * freq * 0.7 - t * 0.8);
    n += amp * 0.5 * sin(p.y * freq * 1.3 + t * 1.2 + audio_mid * 2.0);
    amp *= 0.5;
    freq *= 2.1;
  }
  
  n = n * 0.5 + 0.5;
  
  // Metallic shading
  float highlight = pow(n, 3.0 + audio_high * 2.0);
  vec3 col = mix(
    vec3(0.05, 0.05, 0.1),
    vec3(0.7, 0.75, 0.8),
    n
  );
  col += vec3(1.0, 0.95, 0.9) * highlight * 0.5;
  col *= 1.0 + audio_beat * 0.6;
  
  // Color tint from audio
  col += vec3(audio_bass * 0.1, 0.0, audio_high * 0.1);
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

const ELECTRIC_ARCS: ISFPreset = {
  name: 'Electric Arcs',
  author: 'DEViLBOX',
  category: 'Energy',
  description: 'Lightning-like electric arcs synced to beats',
  fragmentShader: `/*{
  "DESCRIPTION": "Audio-reactive electric arcs",
  "CREDIT": "DEViLBOX",
  "CATEGORIES": ["Generator", "Energy"],
  "INPUTS": [
    { "NAME": "arc_count", "TYPE": "float", "DEFAULT": 5.0, "MIN": 1.0, "MAX": 10.0 },
    { "NAME": "intensity", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.1, "MAX": 3.0 },
    { "NAME": "audio_bass", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_mid", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_high", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "audio_beat", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/

float hash1(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / min(RENDERSIZE.x, RENDERSIZE.y);
  float t = TIME;
  
  vec3 col = vec3(0.0);
  
  for (float i = 0.0; i < 10.0; i++) {
    if (i >= arc_count) break;
    
    float angle = i / arc_count * 6.283 + t * 0.3;
    vec2 dir = vec2(cos(angle), sin(angle));
    
    // Arc path with noise
    float d = dot(uv, dir);
    float perp = length(uv - dir * d);
    
    float noise = sin(d * 20.0 + t * 5.0 + i * 7.0) * 0.02 * (1.0 + audio_mid * 2.0);
    noise += sin(d * 40.0 + t * 8.0) * 0.01 * audio_high;
    
    float arc = smoothstep(0.03 * intensity, 0.0, abs(perp + noise - 0.001));
    arc *= smoothstep(0.0, 0.2, abs(d)) * smoothstep(0.8, 0.2, abs(d));
    arc *= (0.3 + audio_bass * 0.7 + audio_beat * 0.5);
    
    vec3 arcCol = vec3(0.3, 0.5, 1.0) + vec3(0.5, 0.3, 0.0) * hash1(i);
    col += arcCol * arc;
  }
  
  // Center glow
  float glow = 0.05 / (length(uv) + 0.1);
  col += vec3(0.2, 0.4, 0.8) * glow * (0.3 + audio_beat * 0.7);
  
  gl_FragColor = vec4(col, 1.0);
}`,
};

// ─── Export all presets ────────────────────────────────────────────────────────

export const ISF_PRESETS: ISFPreset[] = [
  PLASMA_TUNNEL,
  FRACTAL_WARP,
  NEON_GRID,
  KALEIDOSCOPE,
  WAVEFORM_RINGS,
  STARFIELD,
  LIQUID_METAL,
  ELECTRIC_ARCS,
];

/** Get preset by name */
export function getISFPreset(name: string): ISFPreset | undefined {
  return ISF_PRESETS.find(p => p.name === name);
}

/** Get all category names */
export function getISFCategories(): string[] {
  return [...new Set(ISF_PRESETS.map(p => p.category).filter(Boolean))] as string[];
}
