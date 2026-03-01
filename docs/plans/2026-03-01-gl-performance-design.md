---
date: 2026-03-01
topic: gl-performance
tags: [pixi, webgl, performance, rendering]
status: final
---

# GL Performance — Full Optimization Design

**Goal:** Fast, smooth 60fps rendering across all workbench states. Reduce per-frame GPU/CPU cost, eliminate wasted work for off-screen content, and scale quality automatically when frame budget is tight.

**Architecture:** Layered optimizations — culling first (eliminate work), caching second (amortize work), adaptive quality third (shed work under load).

**Tech Stack:** PixiJS v8, @pixi/react, @pixi/layout, Zustand, RAF/ticker hybrid animation system.

---

## Item 1 — Off-Screen Window Culling

**File:** `src/pixi/workbench/WorkbenchContainer.tsx`

Each Pixi ticker tick, for every window in the workbench store:
1. Compute the window's AABB in world space: `{ x: win.x, y: win.y, w: win.width, h: win.height }`
2. Transform to screen space using current camera: `screenX = cam.x + worldX * cam.scale`
3. Check intersection with `[0, 0, viewportW, viewportH]`
4. If outside: set `pixiWindowRef.renderable = false`
5. If inside: set `pixiWindowRef.renderable = true`

Use a ref map `windowRenderableRefs: Record<string, Container>` populated by each `PixiWindow` on mount (via a callback prop or context).

**No visual change** — `renderable = false` skips draw but keeps the React tree alive (no unmount/remount cost).

---

## Item 2 — interactiveChildren Pruning

**File:** `src/pixi/workbench/PixiWindow.tsx`

Add `interactiveChildren` prop to each window's root `pixiContainer`:
- **Focused window** (`windowId === activeWindowId`): `interactiveChildren = true`
- **All other windows**: `interactiveChildren = false`

`activeWindowId` is already in workbench store. Subscribe to it in `PixiWindow` and update the prop reactively.

Cuts Pixi's pointer-event hit-test tree from ~80 nodes (6 windows × ~13 interactive children each) to ~15 (1 focused window).

---

## Item 3 — Background Grid as RenderTexture

**File:** `src/pixi/workbench/WorkbenchBackground.tsx`

**Current:** `drawBg` callback rebuilds entire Graphics command list on every `camera.x`, `camera.y`, `camera.scale` change — every pan frame.

**New approach:**
1. On mount (and on zoom change), render the repeating dot pattern into a `RenderTexture` sized to one grid repeat unit (e.g. `gridPx × gridPx` pixels at current zoom).
2. Use a `TilingSprite` backed by that texture to fill the workbench area.
3. On pan: update `tilingSprite.tilePosition.x/y` — one float write, no Graphics rebuild.
4. On zoom: re-render the RenderTexture (zoom changes are infrequent vs pan).

Remove `camera.x` and `camera.y` from the `drawBg` dependency array entirely.

---

## Item 4 — cacheAsTexture on Window Chrome

**File:** `src/pixi/workbench/PixiWindow.tsx`

The window frame container (background rect, border, title bar, button row) is static between resizes and focus changes. Call `container.cacheAsTexture(true)` on the chrome container after mount.

Invalidate (re-cache) only when:
- Window is resized (`w` or `h` changes)
- Window gains/loses focus (`focused` changes)
- Theme changes

Use a `useEffect([w, h, focused, theme])` that calls `chromeRef.current?.updateCacheTexture()` to force a re-render of the cached texture when those deps change.

**Result:** Pixi issues one quad draw for the entire chrome instead of re-executing all Graphics draw commands each frame.

---

## Item 5 — Consolidate Per-Window RAF Springs

**File:** `src/pixi/workbench/PixiWindow.tsx`, new file `src/pixi/workbench/windowSpringRegistry.ts`

**Current:** Each window's open/close animation calls `requestAnimationFrame` in its own loop. Up to 6 concurrent RAF callbacks.

**New:**
1. Create `windowSpringRegistry.ts` — a singleton that maintains a `Map<windowId, SpringState>` and registers a **single** Pixi ticker callback.
2. Each `PixiWindow` calls `registry.startSpring(id, direction, onUpdate, onDone)` instead of spinning up its own RAF.
3. The ticker callback steps all active springs each tick, calls `onUpdate(scale)` for each, and removes completed springs.

**Result:** 1 ticker callback instead of up to 6 RAF loops. Springs remain smooth because the ticker runs at 60fps during active periods.

---

## Item 6 — Static vs Dynamic Stage Layers

**File:** `src/pixi/PixiRoot.tsx` (or `PixiApp.tsx`)

Split `app.stage` children into two containers:
- `staticLayer` — NavBar, StatusBar, window chrome (things that only change on user action)
- `dynamicLayer` — workbench world container, content views, playhead, VU meters

Call `staticLayer.cacheAsTexture(true)`. Pixi composites the cached static texture with the dynamically-rendered world each frame, rather than re-drawing all chrome.

Invalidate `staticLayer` cache only when: theme changes, window opens/closes, tab changes.

**Implementation note:** The NavBar and StatusBar are DOM elements currently rendered above the canvas — only the Pixi-rendered chrome (window frames visible through the workbench) is in scope here. Confirm exact layer boundaries during implementation.

---

## Item 7 — FPS-Aware Adaptive Quality

**File:** `src/pixi/workbench/performance.ts`

Add a rolling FPS monitor to the existing `attachFPSLimiter`:

```ts
// 30-frame rolling average
const frameTimes: number[] = [];
let lastFrameTime = performance.now();

app.ticker.add(() => {
  const now = performance.now();
  frameTimes.push(now - lastFrameTime);
  lastFrameTime = now;
  if (frameTimes.length > 30) frameTimes.shift();
  const avgFps = 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length);
  onFpsUpdate(avgFps);
});
```

Expose `onFpsUpdate` as a callback. In `PixiRoot`/`CRTRenderer`:
- **CRT bloom**: disable when `avgFps < 45`, re-enable when `avgFps > 55` (hysteresis prevents flicker)
- **Grid minor dots**: skip when `avgFps < 40` (extend the existing zoom-out skip)

**Adaptive idle threshold:** Change `IDLE_TIMEOUT_MS` from `2000` to `1000` in `attachFPSLimiter`.

---

## Success Criteria

**Automated:**
- `tsc --noEmit` passes after each item
- No new console errors or React warnings

**Manual:**
- Panning with all 6 windows open: consistent 60fps (no visible stutter)
- FPS stays ≥55 with CRT enabled on a typical laptop GPU
- Idle power: ticker drops to 10fps within 1 second of inactivity
- Window open/close animations remain smooth
- No visual regressions: chrome looks identical, grid looks identical

---

## Implementation Order

Items are ordered by impact/risk ratio — highest impact, lowest risk first:

1. Item 2 — interactiveChildren pruning (3 lines of code, immediate win)
2. Item 5 — Consolidate RAF springs (medium, no visual change)
3. Item 1 — Off-screen culling (medium, biggest render win)
4. Item 4 — cacheAsTexture on chrome (medium, verify no visual glitch)
5. Item 3 — Grid RenderTexture (higher effort, big pan performance win)
6. Item 7 — Adaptive quality (requires FPS monitor plumbing)
7. Item 6 — Static/dynamic layer split (highest effort, confirm scope during impl)
