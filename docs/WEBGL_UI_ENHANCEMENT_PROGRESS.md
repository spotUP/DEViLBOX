# WebGL UI Enhancement — Progress Report

**Date:** 2026-02-21
**Status:** Complete (all 5 phases implemented and profiled)

---

## Objective

Replace DOM overlays in WebGL render mode with native PixiJS rendering wherever feasible, making the WebGL mode a meaningful performance upgrade rather than a thin wrapper around the same DOM components.

**Constraint preserved:** The PatternEditorCanvas stays as a DOM overlay — it already uses WebGL2 with instanced 3-pass rendering in an OffscreenCanvas worker. Moving it to Pixi would be a downgrade.

---

## Phases Completed

### Phase 1: Fix Idle Black Screen

**Problem:** The FPS limiter dropped to 10 FPS after 2s idle. Without `preserveDrawingBuffer`, the canvas went black between frames.

**Fix:**
- Added `preserveDrawingBuffer: true` to `PixiApp.tsx` Application options
- Added a forced `app.renderer.render(app.stage)` call in `performance.ts` before entering idle FPS

**Files:** `src/pixi/PixiApp.tsx`, `src/pixi/performance.ts`

---

### Phase 2: Native Pixi FT2 Toolbar

**Problem:** The FT2 toolbar was a DOM overlay adding ~50+ buttons, SVG icons, and input elements to the DOM tree, with z-index layering issues against modals.

**Fix:**
- Activated the existing `PixiFT2Toolbar` component (was previously built but unused)
- Added Song Length display with +/- insert/delete position controls
- Replaced the `<PixiDOMOverlay><FT2Toolbar/></PixiDOMOverlay>` with native `<PixiFT2Toolbar/>`
- Removed unused modal callback props from PixiTrackerView

**Files:** `src/pixi/views/tracker/PixiFT2Toolbar.tsx`, `src/pixi/views/PixiTrackerView.tsx`

---

### Phase 3: Native Pixi Instrument List

**Problem:** The instrument selector was a DOM overlay with 16+ list items, each containing icons, badges, hover actions, and drag handlers.

**Fix:**
- Created `PixiInstrumentPanel.tsx` using the existing `PixiList` virtual scroll component
- Shows instrument number, name, and synth type badge
- Supports selection, double-click to open editor, and instrument preview on click
- Action bar with Add, Copy, Delete, and Preset buttons
- Replaced DOM overlay in PixiTrackerView with native panel

**Files:** `src/pixi/views/tracker/PixiInstrumentPanel.tsx` (new), `src/pixi/views/PixiTrackerView.tsx`

---

### Phase 4: GPU Waveform/Oscilloscope Visualizer

**Problem:** The existing toolbar visualizer was a basic 32-bar FFT spectrum. It didn't showcase WebGL's rendering advantage.

**Fix:**
- Created `PixiVisualizer.tsx` with three modes (click to cycle):
  - **Waveform** — Real-time oscilloscope with glow effect using Pixi Graphics
  - **Spectrum** — 48-bar FFT with peak hold indicators and gradient coloring
  - **Vectorscope** — Lissajous L/R stereo field display (unique to WebGL mode)
- Connected to ToneEngine's AnalyserNode via `enableAnalysers()`
- 60fps rAF animation loop with proper cleanup
- Replaced the old PixiSpectrumVisualizer in the toolbar

**Files:** `src/pixi/views/tracker/PixiVisualizer.tsx` (new), `src/pixi/views/tracker/PixiFT2Toolbar.tsx`

---

### Phase 5: Smooth View Transition Animations

**Problem:** View switching (Tracker/Arrangement/DJ/Piano Roll) was instant and jarring.

**Fix:**
- Created `usePixiTransition` hook with 200ms ease-out cubic animation
- Crossfade + slide: old view fades out sliding left, new view fades in from right
- Uses Pixi's `alpha` and `x` properties for GPU-accelerated animation (no DOM reflow)
- Renders both views simultaneously during the 200ms transition window
- Respects `prefers-reduced-motion` for accessibility
- Extracted `PixiViewContent` component in PixiRoot for reuse during transitions

**Files:** `src/pixi/hooks/usePixiTransition.ts` (new), `src/pixi/PixiRoot.tsx`

---

## Profiling Results

Measured with Chrome DevTools on `localhost:5173`, comparing DOM mode vs WebGL mode on the same tracker view with 16 instruments loaded.

### DOM Node Metrics

| Metric | DOM Mode | WebGL Mode | Improvement |
|--------|----------|------------|-------------|
| Total DOM nodes | 1,123 | 353 | **68.6% fewer** |
| Max tree depth | 21 | 11 | **47.6% shallower** |
| `<div>` elements | 188 | 40 | 78.7% fewer |
| `<button>` elements | 129 | 21 | 83.7% fewer |
| `<span>` elements | 126 | 5 | 96.0% fewer |
| `<svg>` icons | 109 | 22 | 79.8% fewer |

### Performance

| Metric | DOM Mode | WebGL Mode | Improvement |
|--------|----------|------------|-------------|
| Style recalc time | 24.6 ms | 7.8 ms | **3.2x faster** |
| Largest recalc spike | 80 ms (1,036 elements) | None | **Eliminated** |
| Forced reflows | Flagged by DevTools | None | **Eliminated** |
| LCP (load to visible) | 2,859 ms | 2,403 ms | **1.2x faster** |
| CLS (layout shift) | 0.07 | 0.01 | **7x less jank** |

### Before vs After (WebGL mode only)

Previous profiling (before this work) showed WebGL mode with DOM overlays for everything:
- 45% shallower tree, 9% fewer nodes, 20% faster style recalc

After replacing toolbar + instrument list with native Pixi:
- **48% shallower tree, 69% fewer nodes, 68% faster style recalc**

---

## What Stays as DOM Overlays

| Component | Reason |
|-----------|--------|
| PatternEditorCanvas | Already WebGL2 in OffscreenCanvas worker — moving to Pixi = downgrade |
| PatternManagement panel | Uses @dnd-kit drag-and-drop (DOM-only) |
| Select dropdowns (view mode, hardware presets, subsong) | OS-native behavior expected |
| Modal dialogs | Complex forms, rendered via WebGLModalBridge portal |
| Furnace/Hively editors | Format-specific DOM editors with their own canvas rendering |

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/pixi/PixiApp.tsx` | Added `preserveDrawingBuffer` |
| `src/pixi/performance.ts` | Force final render before idle |
| `src/pixi/views/tracker/PixiFT2Toolbar.tsx` | Added song length controls, integrated visualizer |
| `src/pixi/views/tracker/PixiVisualizer.tsx` | **New** — 3-mode GPU visualizer |
| `src/pixi/views/tracker/PixiInstrumentPanel.tsx` | **New** — Native instrument list |
| `src/pixi/views/PixiTrackerView.tsx` | Swapped DOM overlays for native components |
| `src/pixi/hooks/usePixiTransition.ts` | **New** — View transition animation hook |
| `src/pixi/PixiRoot.tsx` | Integrated transition animations |
