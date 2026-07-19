---
date: 2026-03-25
topic: ios-pattern-editor
tags: [ios, mobile, pattern-editor, canvas2d]
status: draft
---

# iOS Pattern Editor — Main-Thread Canvas2D Renderer

## Problem
iOS Safari doesn't support WebGL2 on OffscreenCanvas in Workers (hangs silently).
The current pattern editor relies entirely on this architecture.
Current iOS fallback is a basic HTML table with no interactivity.

## Existing Assets
- `src/engine/renderer/TrackerCanvas2DRenderer.ts` — full Canvas2D renderer (used as Worker fallback)
- `src/engine/renderer/TrackerGLRenderer.ts` — WebGL2 renderer (primary)
- `src/workers/tracker-render.worker.ts` — Worker bridge that tries GL then falls back to Canvas2D
- `src/components/tracker/PatternEditorCanvas.tsx` — component that owns the Worker bridge
- `src/hooks/tracker/usePatternEditor.ts` — shared hook for both editor views

## Approach: Main-Thread Canvas2D for iOS
1. Detect iOS in PatternEditorCanvas
2. Instead of creating a Worker, instantiate `TrackerCanvas2DRenderer` directly on a regular `<canvas>`
3. Subscribe to stores (patterns, cursor, selection, theme) on the main thread
4. Drive rendering via requestAnimationFrame (throttled to 30fps to save battery)
5. Handle mouse/touch events directly on the canvas

## Key Challenges
- TrackerCanvas2DRenderer expects OffscreenCanvas — may need adaptation for regular canvas
- Store subscription data format must match what the Worker bridge sends
- Touch handling for scrolling, cursor movement, selection needs to work
- Performance: Canvas2D on main thread + store subscriptions must not block the UI

## Files to Modify
- `src/components/tracker/PatternEditorCanvas.tsx` — add iOS main-thread path
- `src/engine/renderer/TrackerCanvas2DRenderer.ts` — adapt for regular canvas if needed
- Potentially extract store subscription logic from the Worker bridge

## What Already Works on iOS
- **Matrix editors** (AHX sequence, Furnace order, GT Ultra order, Klystrack positions,
  MusicLine track tables) — all use regular Canvas2D on main thread, no Workers
- **Canvas2D renderer** — data-driven column path supports ALL format editors
  (JamCracker, Hively/AHX, Furnace, Klystrack, etc.) via ColumnSpec system
- Both renderers share the same column layout system, so format editors will
  render correctly once the main-thread path is wired up

## Estimated Effort
Medium-large — the renderer exists, but wiring it to the main thread with store subscriptions
and touch handling is ~2-4 hours of work.
