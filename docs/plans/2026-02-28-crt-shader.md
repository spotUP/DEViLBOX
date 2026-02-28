# CRT Shader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-screen WebGL CRT post-processing shader (scanlines, curvature, bloom, RGB shift, vignette, flicker) toggleable from the Settings modal with a full tweak panel.

**Architecture:** `CRTRenderer` class mirrors `WorkbenchTiltRenderer` exactly — renders PixiRoot's scene container to a `RenderTexture`, then draws a full-screen quad `Mesh` with the CRT GLSL shader sampling that RT. The scene container uses `renderable = false` during Pixi's screen render (preventing double-draw) but stays `visible = true` (preserving pointer events). Mounted in `PixiRoot.tsx`. State (on/off + 12 params) lives in `useSettingsStore`, persisted to localStorage. Settings modal gets a new CRT SHADER section with full sliders.

**Tech Stack:** TypeScript, PixiJS v8 (`RenderTexture`, `Mesh`, `Shader`, `GlProgram`, `Geometry`, `Buffer`), `@pixi/react` (`useApplication`, `useTick`), Zustand immer+persist

**Reference shader:** `Reference Code/webgl-crt-shader-main/CRTShader.js` — adapted to WebGL2 (`#version 300 es`, `in`/`out`, `texture()`, `fragColor`). GLSL uniform names prefixed with `u` to match WorkbenchTilt conventions.

---

## Context every implementer must know

**WorkbenchTiltRenderer pattern** (`src/pixi/workbench/WorkbenchTilt.ts`) is the reference for all PixiJS v8 mesh shader code. `CRTRenderer` is structurally identical — same imports, same geometry setup, same render loop.

**PixiJS v8 float uniforms:** Pass a named plain object in `resources`. PixiJS wraps it into a `UniformGroup`. Keep a private reference to the object; mutate `.value` in place each frame to update. Example:
```typescript
const _uniforms = { uTime: { value: 0.0, type: 'f32' } };
new Shader({ glProgram, resources: { uTexture: rt.source, uniforms: _uniforms } });
// Update:
_uniforms.uTime.value = newTime;
```

**`renderable` vs `visible`:** Use `renderable = false` (not `visible = false`) on the scene container during Pixi's screen render. `renderable = false` skips drawing but keeps `visible = true`, so PixiJS's EventSystem continues to deliver pointer events to the scene.

**Ticker ordering:** `useTick` callbacks (NORMAL priority) fire BEFORE Pixi's own screen render (LOW priority). So inside `useTick`, we can: render to RT → update uniforms → flip renderable flags → Pixi renders to screen.

**PixiRoot outer container:** `PixiRoot.tsx` renders a root `pixiContainer`. Adding `ref={rootContainerRef}` (where `rootContainerRef = useRef<ContainerType>(null)`) gives a `ContainerType` reference to pass to `CRTRenderer`. This container has `app.stage` as its parent (the JSX inside `Application` is mounted directly to `app.stage`).

**CRT mesh placement:** Added to `app.stage` imperatively in the `CRTRenderer` constructor. `zIndex = 10000` puts it above everything (WorkbenchTilt uses 9000). `app.stage.sortableChildren = true` must be set (already is, set by PixiJS default).

---

## Task 1: Add `CRTParams` type and state to `useSettingsStore`

**Files:**
- Modify: `src/stores/useSettingsStore.ts`

### Step 1: Add `CRTParams` interface and defaults constant

Find the line near the top of `useSettingsStore.ts` where `UADEImportMode` is defined (around line 21). Add immediately after:

```typescript
export interface CRTParams {
  scanlineIntensity: number;  // 0–1
  scanlineCount:     number;  // 50–1200
  adaptiveIntensity: number;  // 0–1
  brightness:        number;  // 0.6–1.8
  contrast:          number;  // 0.6–1.8
  saturation:        number;  // 0–2
  bloomIntensity:    number;  // 0–1.5
  bloomThreshold:    number;  // 0–1
  rgbShift:          number;  // 0–1
  vignetteStrength:  number;  // 0–2
  curvature:         number;  // 0–0.5
  flickerStrength:   number;  // 0–0.15
}

export const CRT_DEFAULT_PARAMS: CRTParams = {
  scanlineIntensity: 0.15,
  scanlineCount:     400,
  adaptiveIntensity: 0.5,
  brightness:        1.1,
  contrast:          1.05,
  saturation:        1.1,
  bloomIntensity:    0.2,
  bloomThreshold:    0.5,
  rgbShift:          0.0,
  vignetteStrength:  0.3,
  curvature:         0.15,
  flickerStrength:   0.01,
};
```

### Step 2: Add fields and actions to the store interface

Find the `// Render Mode` comment block in the interface (around line 187). Add before it:

```typescript
  // CRT Shader
  crtEnabled: boolean;
  crtParams:  CRTParams;
```

Find the `setRenderMode` action signature. Add after it:

```typescript
  setCrtEnabled: (enabled: boolean) => void;
  setCrtParam:   (param: keyof CRTParams, value: number) => void;
  resetCrtParams: () => void;
```

### Step 3: Add initial state values

Find `renderMode: 'webgl' as const,` in the initial state (around line 356). Add before it:

```typescript
      crtEnabled: false,
      crtParams:  { ...CRT_DEFAULT_PARAMS },
```

### Step 4: Add action implementations

Find `setRenderMode: (renderMode) =>` in the immer actions. Add after its closing `}),`:

```typescript
    setCrtEnabled: (crtEnabled) =>
      set((state) => { state.crtEnabled = crtEnabled; }),

    setCrtParam: (param, value) =>
      set((state) => { state.crtParams[param] = value; }),

    resetCrtParams: () =>
      set((state) => { state.crtParams = { ...CRT_DEFAULT_PARAMS }; }),
```

### Step 5: Verify persistence

Find the `partialize` or storage config at the bottom of `useSettingsStore.ts`. The persist middleware currently excludes `renderMode`. Confirm that `crtEnabled` and `crtParams` are NOT in any exclusion list (they should persist by default). If there's an explicit `partialize` whitelist, add both fields.

### Step 6: Type check

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `useSettingsStore.ts`.

### Step 7: Commit

```bash
git add src/stores/useSettingsStore.ts
git commit -m "feat(crt): add CRTParams type and state to useSettingsStore"
```

---

## Task 2: Add CRT settings section to `SettingsModal.tsx`

**Files:**
- Modify: `src/components/dialogs/SettingsModal.tsx`

### Step 1: Import new store fields

Find the `useSettingsStore` import/destructure in `SettingsModal.tsx`. Add `crtEnabled`, `crtParams`, `setCrtEnabled`, `setCrtParam`, `resetCrtParams` to the destructure.

Also add `CRT_DEFAULT_PARAMS` to the import from `@stores/useSettingsStore` (or wherever the store is imported from):

```typescript
import { useSettingsStore, CRT_DEFAULT_PARAMS } from '@stores/useSettingsStore';
// Remove CRT_DEFAULT_PARAMS import if resetCrtParams is used instead — it's not needed directly.
```

Destructure from the store:
```typescript
const {
  // ... existing fields ...
  crtEnabled, setCrtEnabled,
  crtParams, setCrtParam, resetCrtParams,
} = useSettingsStore();
```

### Step 2: Add a `CRTSlider` helper component

Add this small component definition at the TOP of the file (after imports, before the main component):

```tsx
interface CRTSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

const CRTSlider: React.FC<CRTSliderProps> = ({ label, value, min, max, step, onChange }) => (
  <div className="flex items-center justify-between gap-2">
    <label className="text-ft2-text text-[10px] font-mono w-28 shrink-0">{label}</label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="flex-1 h-1 accent-ft2-highlight cursor-pointer"
    />
    <span className="text-ft2-textDim text-[10px] font-mono w-10 text-right tabular-nums">
      {value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}
    </span>
  </div>
);
```

### Step 3: Add the CRT SHADER section

Find the closing `</section>` of the DISPLAY section (after the Visual Background settings, around line 236). Add a new section immediately after:

```tsx
          {/* CRT Shader Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">CRT SHADER</h3>
            <div className="space-y-3">

              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <label className="text-ft2-text text-xs font-mono">CRT Effect:</label>
                  <span className="text-[9px] text-ft2-textDim font-mono">WebGL post-processing — scanlines, curvature, bloom</span>
                </div>
                <Toggle label="" value={crtEnabled} onChange={setCrtEnabled} size="sm" />
              </div>

              {/* Param sliders — only shown when enabled */}
              {crtEnabled && (
                <div className="space-y-2 border-t border-ft2-border pt-3">

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide">SCANLINES</div>
                  <CRTSlider label="Intensity"  value={crtParams.scanlineIntensity} min={0}   max={1}    step={0.01}  onChange={(v) => setCrtParam('scanlineIntensity', v)} />
                  <CRTSlider label="Count"      value={crtParams.scanlineCount}     min={50}  max={1200} step={1}     onChange={(v) => setCrtParam('scanlineCount', v)} />
                  <CRTSlider label="Adaptive"   value={crtParams.adaptiveIntensity} min={0}   max={1}    step={0.01}  onChange={(v) => setCrtParam('adaptiveIntensity', v)} />

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">COLOR</div>
                  <CRTSlider label="Brightness" value={crtParams.brightness}        min={0.6} max={1.8}  step={0.01}  onChange={(v) => setCrtParam('brightness', v)} />
                  <CRTSlider label="Contrast"   value={crtParams.contrast}          min={0.6} max={1.8}  step={0.01}  onChange={(v) => setCrtParam('contrast', v)} />
                  <CRTSlider label="Saturation" value={crtParams.saturation}        min={0}   max={2}    step={0.01}  onChange={(v) => setCrtParam('saturation', v)} />

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">EFFECTS</div>
                  <CRTSlider label="Bloom Intensity" value={crtParams.bloomIntensity}  min={0} max={1.5} step={0.01}  onChange={(v) => setCrtParam('bloomIntensity', v)} />
                  <CRTSlider label="Bloom Threshold" value={crtParams.bloomThreshold}  min={0} max={1}   step={0.01}  onChange={(v) => setCrtParam('bloomThreshold', v)} />
                  <CRTSlider label="RGB Shift"       value={crtParams.rgbShift}        min={0} max={1}   step={0.01}  onChange={(v) => setCrtParam('rgbShift', v)} />

                  <div className="text-[9px] text-ft2-highlight font-mono font-bold tracking-wide pt-1">FRAMING</div>
                  <CRTSlider label="Vignette"   value={crtParams.vignetteStrength}  min={0}   max={2}   step={0.01}  onChange={(v) => setCrtParam('vignetteStrength', v)} />
                  <CRTSlider label="Curvature"  value={crtParams.curvature}         min={0}   max={0.5} step={0.005} onChange={(v) => setCrtParam('curvature', v)} />
                  <CRTSlider label="Flicker"    value={crtParams.flickerStrength}   min={0}   max={0.15} step={0.001} onChange={(v) => setCrtParam('flickerStrength', v)} />

                  <button
                    onClick={resetCrtParams}
                    className="w-full text-[10px] font-mono text-ft2-textDim border border-ft2-border hover:border-ft2-highlight hover:text-ft2-highlight px-2 py-1 transition-colors mt-1"
                  >
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          </section>
```

### Step 4: Type check

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

### Step 5: Commit

```bash
git add src/components/dialogs/SettingsModal.tsx
git commit -m "feat(crt): add CRT shader settings section to SettingsModal"
```

---

## Task 3: Create `CRTRenderer.ts`

**Files:**
- Create: `src/pixi/CRTRenderer.ts`

This is the core rendering class. Structurally identical to `WorkbenchTiltRenderer` (`src/pixi/workbench/WorkbenchTilt.ts`) — read that file first to understand the pattern.

### Step 1: Write the GLSL shaders

The vertex shader is identical to WorkbenchTilt's VERT. The fragment shader is adapted from `Reference Code/webgl-crt-shader-main/CRTShader.js` — WebGL2 style, `uTexture` instead of `tDiffuse`, `in vec2 vUV` instead of `varying vec2 vUv`, `texture()` instead of `texture2D()`, `out vec4 fragColor` instead of `gl_FragColor`, uniform names prefixed with `u`.

### Step 2: Create `src/pixi/CRTRenderer.ts`

```typescript
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
  uniform float uYOffset;
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
      float scanY = (uv.y + uYOffset) * uScanlineCount;
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
  private w: number;
  private h: number;

  constructor(
    app: Application,
    sceneContainer: ContainerType,
    width: number,
    height: number,
  ) {
    this.app = app;
    this.sceneContainer = sceneContainer;
    this.w = width;
    this.h = height;

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
      uYOffset:           { value: 0.0,  type: 'f32' },
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
        uniforms:  this._u,
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
    // Pixi now renders: [sceneContainer renderable=false, skipped] + [mesh, drawn → CRT output]
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
    this.w = width;
    this.h = height;
    this.rt.resize(width, height);
  }

  destroy(): void {
    this.mesh.destroy();
    this.rt.destroy(true);
  }
}
```

### Step 3: Type check

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | head -30
```

**If `Shader` constructor complains about the `resources` type for `uniforms`:** PixiJS v8's `Shader` may require a specific type for the plain-object uniform group. If you see a type error on `resources: { uniforms: this._u }`, try:

```typescript
// Option A — cast to any:
resources: { uTexture: this.rt.source, uniforms: this._u as any },

// Option B — import UniformGroup if exported:
import { UniformGroup } from 'pixi.js';
const uniformGroup = new UniformGroup(this._u);
resources: { uTexture: this.rt.source, uniforms: uniformGroup },
```

Use whichever compiles. The runtime behavior is the same.

### Step 4: Commit

```bash
git add src/pixi/CRTRenderer.ts
git commit -m "feat(crt): add CRTRenderer — RenderTexture + Mesh + GlProgram shader"
```

---

## Task 4: Integrate `CRTRenderer` into `PixiRoot.tsx`

**Files:**
- Modify: `src/pixi/PixiRoot.tsx`

### Step 1: Add imports

Add to the imports in `PixiRoot.tsx`:

```typescript
import { useRef, useEffect } from 'react';
import { useApplication, useTick } from '@pixi/react';
import type { Container as ContainerType } from 'pixi.js';
import { useSettingsStore } from '@stores/useSettingsStore';
import { CRTRenderer } from './CRTRenderer';
```

Note: `useEffect` may already be imported. Don't duplicate it.

### Step 2: Add state and refs inside `PixiRoot`

`PixiRoot` is a functional component. Add these hooks inside it (before the `return`):

```typescript
  const { app } = useApplication();
  const { width, height } = usePixiResponsive();  // already present
  const crtEnabled = useSettingsStore((s) => s.crtEnabled);
  const crtParams  = useSettingsStore((s) => s.crtParams);

  // Ref to the root pixiContainer — passed to CRTRenderer as the scene to capture.
  const rootContainerRef = useRef<ContainerType>(null);
  // CRTRenderer instance — created once, updated each frame.
  const crtRef = useRef<CRTRenderer | null>(null);
```

### Step 3: Create/destroy CRTRenderer when app is ready

Add a `useEffect` that creates the renderer once the app and root container are available:

```typescript
  useEffect(() => {
    if (!app || !rootContainerRef.current) return;
    const renderer = new CRTRenderer(app, rootContainerRef.current, width, height);
    crtRef.current = renderer;
    return () => {
      renderer.destroy();
      crtRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]); // Only re-create when app changes (not width/height — use resize() for that)
```

### Step 4: Resize on canvas size changes

Add a second effect that calls `resize()` when dimensions change:

```typescript
  useEffect(() => {
    crtRef.current?.resize(width, height);
  }, [width, height]);
```

### Step 5: Drive the renderer each tick

Add a `useTick` call:

```typescript
  useTick((ticker) => {
    const crt = crtRef.current;
    if (!crt) return;
    if (crtEnabled) {
      crt.renderFrame(ticker.lastTime / 1000, crtParams);
    } else {
      crt.setEnabled(false);
    }
  });
```

### Step 6: Add `ref` to the root `pixiContainer`

Find the `return` statement in `PixiRoot`. The root element is:

```tsx
    <pixiContainer
      layout={{
        width,
        height,
        flexDirection: 'column',
      }}
    >
```

Add `ref={rootContainerRef}`:

```tsx
    <pixiContainer
      ref={rootContainerRef}
      layout={{
        width,
        height,
        flexDirection: 'column',
      }}
    >
```

### Step 7: Type check

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | head -30
```

**Common issues:**

- `useTick` callback type: if TypeScript complains about `ticker.lastTime`, check the `@pixi/react` Ticker type. May need `(ticker: import('pixi.js').Ticker) => void`. If `lastTime` isn't available, use `ticker.elapsedMS / 1000` or `performance.now() / 1000` instead.

- `ref` on `pixiContainer` JSX element: `@pixi/react` v8 supports standard React `ref` on pixi JSX elements. If you get a type error, try `pixiRef` from `@pixi/react`:
  ```typescript
  import { pixiRef } from '@pixi/react';
  const rootContainerRef = pixiRef<ContainerType>();
  // Usage: ref={rootContainerRef}
  ```

### Step 8: Commit

```bash
git add src/pixi/PixiRoot.tsx
git commit -m "feat(crt): integrate CRTRenderer into PixiRoot with useTick drive loop"
```

---

## Task 5: Full type check and manual verification

### Step 1: Full type check with zero errors

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

### Step 2: Manual verification checklist

Open the app in the browser (`npm run dev` or existing dev server).

**Settings modal:**
- [ ] Open Settings → find "CRT SHADER" section
- [ ] Toggle ON → sliders appear
- [ ] Move scanline intensity slider → value updates in real time
- [ ] Toggle OFF → sliders disappear, canvas returns to normal

**CRT effect (when enabled):**
- [ ] Scanlines visible across the entire screen (NavBar + workbench + status bar)
- [ ] Screen curvature bends corners slightly (curvature > 0)
- [ ] Vignette darkens the edges
- [ ] Flicker visible at flicker > 0.05
- [ ] RGB shift causes subtle color fringing at rgbShift > 0.3
- [ ] Bloom glows on bright elements at bloomIntensity > 0.3

**Interaction (with CRT enabled):**
- [ ] Clicking tracker pattern cells still works
- [ ] Dragging windows in workbench still works
- [ ] Knob dragging still works
- [ ] No visible double-draw (CRT-processed image should look like ONE pass through the shader, not a double-render)

**WorkbenchTilt + CRT:**
- [ ] Enable both 3D tilt (settings) and CRT → both effects apply (tilt is processed by CRT, giving a tilted + CRT-filtered result)

**Persistence:**
- [ ] Refresh the page → CRT enabled/disabled state preserved
- [ ] Slider values preserved across refresh

**Performance:**
- [ ] No visible frame rate drop with CRT enabled (should be near-zero GPU overhead for a single pass shader)

### Step 3: Fix any issues found

If the shader produces a blank screen, the `sceneContainer.renderable = false` step may be running before the RT render captures it. Add a `console.log` before the RT render to verify `sceneContainer.renderable === true`. If it's false before the RT render, the issue is in the ordering — restore `renderable = true` earlier.

If uniforms aren't updating (e.g., sliders move but no change on screen), the PixiJS `UniformGroup` mutation approach may need adjustment. Try accessing via `(this.mesh.shader.resources.uniforms as any).uniforms.uScanlineIntensity = value` and see if that works. If so, switch `renderFrame` to use that path instead of mutating `_u` directly.

### Step 4: Final commit

```bash
git add src/pixi/CRTRenderer.ts src/pixi/PixiRoot.tsx src/stores/useSettingsStore.ts src/components/dialogs/SettingsModal.tsx
git commit -m "feat(crt): CRT shader post-processing — full-screen WebGL effect with settings panel"
```

---

## Troubleshooting

**Blank screen when CRT enabled:**
The sceneContainer might not be renderering to RT. Check: in `renderFrame`, after `this.app.renderer.render({ container: this.sceneContainer, target: this.rt })`, does the RT contain a frame? Temporarily set the CRT mesh alpha to 0.5 to see if the original scene shows through.

**Double image (ghosting):**
The sceneContainer is rendering BOTH to the RT (via explicit render call) AND to the screen (normal Pixi render). This means `sceneContainer.renderable = false` isn't working. Verify that `sceneContainer` is the SAME object as the actual root container (check `rootContainerRef.current !== null`).

**Pointer events not working with CRT enabled:**
If using `visible = false` instead of `renderable = false`, switch to `renderable = false`. Check `node_modules/pixi.js` version to confirm `renderable` is respected (it is in v8).

**PixiJS uniform type error:**
If `new Shader({ resources: { uniforms: this._u } })` errors, use the cast: `uniforms: this._u as any`. This is a type-only issue; the runtime behavior is correct.

**`ticker.lastTime` not found:**
In `@pixi/react` useTick, the ticker parameter may be typed differently. Use `Date.now() / 1000` or `performance.now() / 1000` as a fallback for `uTime`. The flicker effect uses `sin(uTime * 110.0)` so accuracy to ~ms is sufficient.
