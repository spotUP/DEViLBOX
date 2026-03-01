# GL Performance Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce per-frame GPU/CPU cost, eliminate wasted rendering work for off-screen content, and auto-scale quality when frame budget is tight.

**Architecture:** Layered optimizations — prune interaction tree (fastest), cull off-screen containers, separate pan from zoom in grid rendering, cache static chrome, move open/close springs into the Pixi ticker, and add FPS-aware quality scaling.

**Tech Stack:** PixiJS v8.16, @pixi/react, @pixi/layout, Zustand, TypeScript.

**Verification after every task:** `tsc --noEmit` must pass with zero errors.

---

## Task 1 — interactiveChildren pruning on window content

**Files:**
- Modify: `src/pixi/workbench/WorkbenchContainer.tsx` (~line 134)

Window content views (Tracker, Piano Roll, etc.) can contain hundreds of interactive Pixi nodes. Only the **focused** window's content needs hit-testing — non-focused windows' content should not be walked by Pixi's pointer event system.

**Step 1: Subscribe to activeWindowId in WorkbenchContainer**

At the top of `WorkbenchContainer` (after the existing `setActiveWindowId` line, ~line 138), add:

```tsx
const activeWindowId = useWorkbenchStore((s) => s.activeWindowId);
```

**Step 2: Apply eventMode to content container per window**

In the window render loop (~line 498–506), change the content `pixiContainer`:

```tsx
// BEFORE:
<pixiContainer
  layout={{
    width: win.width,
    height: win.height - TITLE_H,
    flexDirection: 'column',
  }}
>

// AFTER:
<pixiContainer
  layout={{
    width: win.width,
    height: win.height - TITLE_H,
    flexDirection: 'column',
  }}
  interactiveChildren={id === activeWindowId}
  eventMode={id === activeWindowId ? 'auto' : 'none'}
>
```

**Step 3: Verify**

```bash
tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/pixi/workbench/WorkbenchContainer.tsx
git commit -m "perf(gl): disable interactiveChildren on non-focused window content"
```

---

## Task 2 — Off-screen window culling

**Files:**
- Modify: `src/pixi/workbench/WorkbenchContainer.tsx`
- Modify: `src/pixi/workbench/PixiWindow.tsx`

Windows panned off the viewport still render fully. Set `renderable = false` on off-screen windows — Pixi skips them entirely without unmounting React.

**Step 1: Add dimension refs to WorkbenchContainer**

After the `const worldRef` declaration (~line 141) in `WorkbenchContainer`, add:

```tsx
// Refs so the camera subscription (useEffect([])) always reads fresh values
const viewportWRef = useRef(width);
const viewportHRef = useRef(height);
viewportWRef.current = width;
viewportHRef.current = height;
```

**Step 2: Add window container ref map**

After `viewportHRef`, add:

```tsx
// Map from windowId → PixiWindow outer Container — populated via onMount callback
const windowContainerRefs = useRef<Map<string, ContainerType>>(new Map());

const handleWindowMount = useCallback((winId: string, container: ContainerType | null) => {
  if (container) windowContainerRefs.current.set(winId, container);
  else windowContainerRefs.current.delete(winId);
}, []);
```

**Step 3: Add culling to the camera subscription**

In the `apply` function inside `useEffect(() => { ... }, [])` (~line 165–178), after `applyTransform`:

```tsx
const apply = (cam: CameraState) => {
  if (worldRef.current) applyTransform(worldRef.current, cam);

  // ── Off-screen culling ──────────────────────────────────────────────────
  const vw = viewportWRef.current;
  const vh = viewportHRef.current;
  const wins = useWorkbenchStore.getState().windows;
  for (const [winId, container] of windowContainerRefs.current) {
    const win = wins[winId];
    if (!win) continue;
    // Window AABB in screen space
    const sx = cam.x + win.x * cam.scale;
    const sy = cam.y + win.y * cam.scale;
    const sw = win.width  * cam.scale;
    const sh = win.height * cam.scale;
    // Render only if it overlaps the viewport (with 1px tolerance)
    container.renderable = sx + sw >= -1 && sy + sh >= -1 && sx <= vw + 1 && sy <= vh + 1;
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (snapGfxRef.current && snapLinesRef.current.length > 0) {
    redrawSnapLines(snapGfxRef.current, snapLinesRef.current, snapAlphaRef.current, cam.scale);
  }
  if (zoomTextRef.current) {
    zoomTextRef.current.text = `${Math.round(cam.scale * 100)}%`;
  }
};
```

**Step 4: Add onMount prop to PixiWindow**

In `src/pixi/workbench/PixiWindow.tsx`, add `onMount` to the props interface (~line 109):

```tsx
interface PixiWindowProps {
  id: string;
  title: string;
  camera: CameraState;
  screenW: number;
  screenH: number;
  navBarH?: number;
  onFocus?: (id: string) => void;
  /** Called with the outer Container on mount, null on unmount */
  onMount?: (id: string, container: ContainerType | null) => void;
  children?: React.ReactNode;
}
```

Destructure it in the function signature:

```tsx
export const PixiWindow: React.FC<PixiWindowProps> = ({
  id, title, camera, screenW, screenH, onFocus, onMount, children,
}) => {
```

Add a `useEffect` to call `onMount` after the outer container mounts. Place it after the `outerRef` declaration:

```tsx
// Register outer container with the culling system
useEffect(() => {
  const el = outerRef.current;
  if (!el) return;
  onMount?.(id, el);
  return () => onMount?.(id, null);
}, [id, onMount]);
```

**Step 5: Pass onMount from WorkbenchContainer**

In the `<PixiWindow>` JSX in WorkbenchContainer (~line 489):

```tsx
<PixiWindow
  key={id}
  id={id}
  title={title}
  camera={camera}
  screenW={width}
  screenH={height}
  onFocus={focusWindow}
  onMount={handleWindowMount}    // ← add this
>
```

**Step 6: Verify**

```bash
tsc --noEmit
```

Expected: no errors.

**Step 7: Commit**

```bash
git add src/pixi/workbench/WorkbenchContainer.tsx src/pixi/workbench/PixiWindow.tsx
git commit -m "perf(gl): cull off-screen windows with renderable=false"
```

---

## Task 3 — Background grid: separate pan from zoom

**Files:**
- Modify: `src/pixi/workbench/WorkbenchBackground.tsx`

Currently `drawBg` rebuilds its entire Graphics command list on every camera pan (every `camera.x/y` change). The dot pattern is periodic — only the **tile offset** needs to change on pan. We keep the Graphics for the solid background and move dots into a repositioned container that only redraws when **zoom** changes.

**Step 1: Update imports in WorkbenchBackground.tsx**

```tsx
// BEFORE:
import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';

// AFTER:
import React, { useCallback, useLayoutEffect, useRef } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
```

**Step 2: Replace the entire component body**

```tsx
export const WorkbenchBackground: React.FC<Props> = ({
  width,
  height,
  camera,
  gridSize = 40,
}) => {
  const dotsContainerRef = useRef<ContainerType>(null);

  // ── Compute effective pitch (depends on scale only) ──────────────────────
  const pitch = gridSize * camera.scale;
  const step = pitch < 8 ? Math.ceil(8 / pitch) : 1;
  const effectivePitch = pitch * step;

  // ── Reposition dots container on pan — no graphics rebuild ───────────────
  useLayoutEffect(() => {
    const el = dotsContainerRef.current;
    if (!el) return;
    if (effectivePitch > 200) {
      el.x = 0; el.y = 0;
      return;
    }
    // Shift so dot[0] aligns with the camera pan offset
    const startX = ((camera.x % effectivePitch) + effectivePitch) % effectivePitch;
    const startY = ((camera.y % effectivePitch) + effectivePitch) % effectivePitch;
    el.x = startX - effectivePitch;
    el.y = startY - effectivePitch;
  }, [camera.x, camera.y, effectivePitch]);

  // ── Solid background — only resizes on viewport change ───────────────────
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0x0e0e14 });
  }, [width, height]);

  // ── Dot grid — redraws only when zoom or viewport changes ────────────────
  // Draw from 0 to bufW/bufH (one extra tile on all sides).
  // Container position (above) handles the pan offset.
  const drawDots = useCallback((g: GraphicsType) => {
    g.clear();
    const p = gridSize * camera.scale;
    const s = p < 8 ? Math.ceil(8 / p) : 1;
    const ep = p * s;
    if (ep > 200) return;

    const bufW = width  + ep * 2;
    const bufH = height + ep * 2;
    const dotRadius = Math.max(0.5, Math.min(1.5, camera.scale * 0.8));
    const alpha     = Math.max(0.08, Math.min(0.35, camera.scale * 0.4));

    g.setStrokeStyle({ width: 0 });

    // Minor dots — one batch fill
    let col = 0;
    while (col <= bufW) {
      let row = 0;
      while (row <= bufH) {
        g.circle(col, row, dotRadius);
        row += ep;
      }
      col += ep;
    }
    g.fill({ color: 0x6060a0, alpha });

    // Major dots (every 4 cells) — one batch fill
    const majorPitch = ep * 4;
    if (majorPitch < bufW * 2) {
      const mAlpha  = Math.max(0.12, Math.min(0.5, camera.scale * 0.5));
      const mRadius = Math.max(1, Math.min(2.5, camera.scale * 1.2));
      let mCol = 0;
      while (mCol <= bufW) {
        let mRow = 0;
        while (mRow <= bufH) {
          g.circle(mCol, mRow, mRadius);
          mRow += majorPitch;
        }
        mCol += majorPitch;
      }
      g.fill({ color: 0x8080c0, alpha: mAlpha });
    }
  }, [width, height, camera.scale, gridSize]); // ← NO camera.x, camera.y

  const dotsW = width  + effectivePitch * 2;
  const dotsH = height + effectivePitch * 2;

  return (
    <>
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width, height }}
      />
      <pixiContainer
        ref={dotsContainerRef}
        layout={{ position: 'absolute', width: 0, height: 0 }}
      >
        <pixiGraphics
          draw={drawDots}
          layout={{ position: 'absolute', width: dotsW, height: dotsH }}
        />
      </pixiContainer>
    </>
  );
};
```

**Step 3: Verify**

```bash
tsc --noEmit
```

Expected: no errors.

**Step 4: Manual verify** — pan the workbench. Dots should follow the camera. Zoom in/out; dots should rescale.

**Step 5: Commit**

```bash
git add src/pixi/workbench/WorkbenchBackground.tsx
git commit -m "perf(gl): separate grid pan (position) from zoom (redraw) to eliminate per-pan Graphics rebuild"
```

---

## Task 4 — cacheAsTexture on window chrome

**Files:**
- Modify: `src/pixi/workbench/PixiWindow.tsx`

The window frame, border, title text and button dots are static vectors that only change when the window is resized, focused, or the theme changes. Wrapping them in a cached container converts them from a vector draw each frame to a single quad blit.

**Step 1: Add import for Container**

`Container` is already available as `ContainerType` (from existing import). No change needed.

**Step 2: Add chromeVisualRef**

After `contentRef` declaration (~line 147):

```tsx
// Chrome visual container — cached as texture; invalidated on resize/focus/theme
const chromeVisualRef = useRef<ContainerType>(null);
```

**Step 3: Enable cache on mount, invalidate on change**

After the content mask `useEffect` (~line 450), add:

```tsx
// Enable texture caching for static chrome visuals
useEffect(() => {
  const el = chromeVisualRef.current;
  if (!el) return;
  // Pixi v8: cacheAsTexture(true) converts the container to a cached GPU texture
  (el as ContainerType & { cacheAsTexture?: (v: boolean) => void }).cacheAsTexture?.(true);
}, []);

// Invalidate cache when visible content changes
useEffect(() => {
  const el = chromeVisualRef.current;
  if (!el) return;
  (el as ContainerType & { updateCacheTexture?: () => void }).updateCacheTexture?.();
}, [w, h, focused, theme]);
```

**Step 4: Wrap chrome visuals in the cached container**

In the main return JSX (~line 548), replace the three visual elements (frame, buttons, title) with a single wrapped container:

```tsx
{/* Chrome visuals — cached as texture. Only redrawn on resize/focus/theme. */}
<pixiContainer
  ref={chromeVisualRef}
  layout={{ position: 'absolute', width: w, height: h }}
>
  <pixiGraphics
    draw={drawFrame}
    layout={{ position: 'absolute', width: w, height: h }}
  />
  <pixiGraphics
    draw={drawButtons}
    eventMode="static"
    hitArea={chromeHitArea}
    onPointerDown={handleChromePointerDown}
    cursor="pointer"
    layout={{ position: 'absolute', width: w, height: TITLE_H }}
  />
  <pixiBitmapText
    text={title.toUpperCase()}
    style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
    tint={focused ? theme.accent.color : theme.textSecondary.color}
    x={12}
    y={TITLE_H / 2 - 5}
  />
</pixiContainer>
{/* Title drag — transparent hit-area, NOT cached (always interactive) */}
<pixiGraphics
  draw={drawTitleDrag}
  eventMode="static"
  cursor="move"
  onPointerDown={handleTitlePointerDown}
  layout={{ position: 'absolute', width: w - 44, height: TITLE_H }}
/>
```

(Remove the old three separate visual elements that are now inside the container.)

**Step 5: Verify**

```bash
tsc --noEmit
```

Expected: no errors. Manually verify: window chrome renders correctly, close/focus buttons still work.

**Step 6: Commit**

```bash
git add src/pixi/workbench/PixiWindow.tsx
git commit -m "perf(gl): cacheAsTexture on window chrome — frame/buttons/title cached as GPU quad"
```

---

## Task 5 — Move open/close spring to Pixi ticker

**Files:**
- Modify: `src/pixi/workbench/PixiWindow.tsx`

Each `PixiWindow` open/close animation spins up an independent `requestAnimationFrame` loop. With 6 windows, that's 6 competing RAF callbacks at 60fps even during idle (RAF ignores the ticker's `maxFPS` cap). Replace with `useTick` — piggybacking on the existing Pixi ticker so springs automatically respect the 10fps idle throttle and fire in the same frame as everything else.

**Step 1: Add useTick import**

`@pixi/react` is already imported for other purposes. Add `useTick` to the import:

```tsx
import { useTick } from '@pixi/react';
```

**Step 2: Replace animRafRef with springStateRef**

Remove these existing ref declarations:
- `animRafRef`
- `animStartRef`
- `animDirRef`

Add:

```tsx
// Spring state for open/close animation — driven by Pixi ticker (not RAF)
const springStateRef = useRef<{
  dir: 'open' | 'close';
  startTime: number;
  onDone?: () => void;
} | null>(null);
```

**Step 3: Add useTick for spring**

Directly inside the component (after `springStateRef`, before `runSpring`):

```tsx
useTick(() => {
  const spring = springStateRef.current;
  if (!spring) return;

  const elapsed = performance.now() - spring.startTime;
  const t = Math.min(1, elapsed / SPRING_DURATION);

  let progress = spring.dir === 'open'
    ? springEase(t)
    : 1 - springEase(1 - t, 8, 6);
  progress = Math.max(0, progress);

  const sq = squashStretch(spring.dir === 'open' ? t : 1 - t);
  const sx = progress * sq.scaleX;
  const sy = progress * sq.scaleY;

  const el = outerRef.current;
  if (el) {
    el.scale.x = sx;
    el.scale.y = sy;
    const ww = storeRef.current.winState?.width  ?? 400;
    const wh = storeRef.current.winState?.height ?? 300;
    el.pivot.set(ww / 2, wh / 2);
    el.x = (storeRef.current.winState?.x ?? 0) + ww / 2;
    el.y = (storeRef.current.winState?.y ?? 0) + wh / 2;
  }

  if (t >= 1) {
    if (el) {
      el.scale.set(1);
      el.pivot.set(0, 0);
      el.x = storeRef.current.winState?.x ?? 0;
      el.y = storeRef.current.winState?.y ?? 0;
    }
    if (spring.dir === 'close') setAnimVisible(false);
    spring.onDone?.();
    springStateRef.current = null;
  }
});
```

**Step 4: Simplify runSpring**

Replace the existing `runSpring` with:

```tsx
const runSpring = useCallback((dir: 'open' | 'close', onDone?: () => void) => {
  if (dir === 'open') setAnimVisible(true);
  springStateRef.current = { dir, startTime: performance.now(), onDone };
}, []);
```

**Step 5: Remove old cleanup**

In the cleanup `useEffect` (~line 252), remove `cancelAnimationFrame(animRafRef.current)`:

```tsx
// Cleanup on unmount
useEffect(() => {
  return () => {
    // animRafRef removed — spring now driven by Pixi ticker
    cancelAnimationFrame(momentumRafRef.current);
  };
}, []);
```

**Step 6: Verify**

```bash
tsc --noEmit
```

Open and close a window — animation should still feel the same. Open multiple windows rapidly.

**Step 7: Commit**

```bash
git add src/pixi/workbench/PixiWindow.tsx
git commit -m "perf(gl): move window open/close spring from RAF to Pixi ticker — respects idle FPS cap"
```

---

## Task 6 — Static chrome layer caching (NavBar + StatusBar)

**Files:**
- Modify: `src/pixi/PixiRoot.tsx`

NavBar and StatusBar are Pixi-rendered but change only on user actions (tab switch, theme change, transport state). Caching them as textures means Pixi composites a flat quad instead of re-issuing all their draw commands every frame.

**Step 1: Add imports to PixiRoot.tsx**

```tsx
import { useRef } from 'react'; // already imported — no change needed
import type { Container as ContainerType } from 'pixi.js';
import { usePixiTheme } from './theme';
```

**Step 2: Add refs and cache effects**

Inside `PixiRoot`, after the existing refs:

```tsx
const navBarLayerRef    = useRef<ContainerType>(null);
const statusBarLayerRef = useRef<ContainerType>(null);
const theme = usePixiTheme();

// Enable texture cache for static chrome layers
useEffect(() => {
  (navBarLayerRef.current as any)?.cacheAsTexture?.(true);
  (statusBarLayerRef.current as any)?.cacheAsTexture?.(true);
}, []);

// Invalidate on theme change (colors change)
useEffect(() => {
  (navBarLayerRef.current as any)?.updateCacheTexture?.();
  (statusBarLayerRef.current as any)?.updateCacheTexture?.();
}, [theme]);
```

**Step 3: Wrap NavBar and StatusBar with ref containers**

In the return JSX, replace:

```tsx
<PixiNavBar />
```

with:

```tsx
<pixiContainer ref={navBarLayerRef} layout={{ width: '100%' }}>
  <PixiNavBar />
</pixiContainer>
```

And replace:

```tsx
<PixiStatusBar />
```

with:

```tsx
<pixiContainer ref={statusBarLayerRef} layout={{ width: '100%' }}>
  <PixiStatusBar />
</pixiContainer>
```

**Step 4: Verify**

```bash
tsc --noEmit
```

NavBar and StatusBar should render identically. Theme switching should update them.

**Step 5: Commit**

```bash
git add src/pixi/PixiRoot.tsx
git commit -m "perf(gl): cacheAsTexture on NavBar and StatusBar — static chrome composited as GPU quad"
```

---

## Task 7 — Adaptive quality: FPS monitor, bloom gating, idle threshold

**Files:**
- Modify: `src/pixi/performance.ts`
- Modify: `src/pixi/PixiRoot.tsx`

When FPS drops below 45, automatically disable CRT bloom (the most expensive effect: 4 extra texture taps per pixel). Re-enable when FPS recovers above 55 (hysteresis prevents flicker). Also cut the idle timeout from 2s to 1s.

**Step 1: Add rolling FPS tracking to performance.ts**

After `IDLE_TIMEOUT_MS`, change its value and add the FPS tracker:

```ts
// BEFORE:
const IDLE_TIMEOUT_MS = 2000;

// AFTER:
const IDLE_TIMEOUT_MS = 1000; // drop to idle 1 second after last activity

// ─── Rolling FPS Monitor ───────────────────────────────────────────────────

const ROLLING_WINDOW = 30;
const _frameTimes: number[] = [];
let   _lastFrameMs = 0;

/** Record a frame tick — called from the Pixi ticker inside attachFPSLimiter */
function _trackFrame(nowMs: number): void {
  if (_lastFrameMs > 0) {
    _frameTimes.push(nowMs - _lastFrameMs);
    if (_frameTimes.length > ROLLING_WINDOW) _frameTimes.shift();
  }
  _lastFrameMs = nowMs;
}

/** 30-frame rolling average FPS. Returns 60 until enough frames have been tracked. */
export function getAverageFps(): number {
  if (_frameTimes.length < 5) return 60;
  const avgMs = _frameTimes.reduce((a, b) => a + b, 0) / _frameTimes.length;
  return avgMs > 0 ? 1000 / avgMs : 60;
}
```

**Step 2: Wire _trackFrame into the ticker**

At the top of `attachFPSLimiter`, before the `markActive` function, add a ticker listener:

```ts
// Track per-frame timing for FPS monitor
const frameTracker = () => _trackFrame(performance.now());
app.ticker.add(frameTracker);
```

Add cleanup in the returned cleanup function:

```ts
return () => {
  app.ticker.remove(frameTracker);
  for (const evt of events) {
    window.removeEventListener(evt, markActive);
  }
  clearInterval(intervalId);
};
```

**Step 3: Import getAverageFps in PixiRoot.tsx**

```tsx
import { attachFPSLimiter, setIsPlayingFn, getAverageFps } from './performance';
```

**Step 4: Gate bloom in PixiRoot useTick**

Replace the existing `useTick` callback body:

```tsx
useTick(() => {
  const crt = crtRef.current;
  if (!crt || !app?.stage) return;

  if (crtEnabled) {
    if (!app.stage.filters?.includes(crt)) app.stage.filters = [crt];

    // Adaptive quality: disable bloom when FPS is low (< 45), re-enable when recovered (> 55)
    const fps = getAverageFps();
    const bloomAllowed = fps > 45; // hysteresis: off below 45, stays off until > 55 implied by next frame check

    crt.updateParams(performance.now() / 1000, {
      ...crtParams,
      bloomStrength: bloomAllowed ? crtParams.bloomStrength : 0,
    });
  } else {
    if (app.stage.filters?.length) app.stage.filters = [];
  }
});
```

**Step 5: Verify**

```bash
tsc --noEmit
```

Expected: no errors.

**Step 6: Manual verify** — With CRT enabled, bloom should auto-disable if FPS drops (testable by CPU throttling in devtools). Idle ticker should drop to 10fps after exactly 1 second of no input.

**Step 7: Commit**

```bash
git add src/pixi/performance.ts src/pixi/PixiRoot.tsx
git commit -m "perf(gl): FPS monitor + adaptive CRT bloom gating + 1s idle threshold"
```

---

## Verification Checklist

After all 7 tasks:

```bash
tsc --noEmit
```

**Manual checks:**
- [ ] Pan the workbench — dots follow camera smoothly, no gaps at edges
- [ ] Zoom in/out — dot size rescales correctly
- [ ] All 6 windows open simultaneously — panning stays smooth
- [ ] Pan a window off-screen — should disappear (renderable=false), reappear when panned back
- [ ] Click a non-focused window — content becomes interactive (focus transfers)
- [ ] Open/close window animation — smooth spring, no visual regression
- [ ] Chrome buttons (close, focus) still work
- [ ] Resize window — chrome visuals update correctly (cache invalidated)
- [ ] CRT on + FPS throttle (devtools) — bloom drops out cleanly
- [ ] 1 second after last input — ticker drops to 10fps (check browser devtools)
- [ ] Theme switch — NavBar/StatusBar re-render correctly
