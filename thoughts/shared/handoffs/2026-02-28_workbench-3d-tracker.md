---
date: 2026-02-28
topic: workbench-3d-tracker
tags: [workbench, pixi, infinite-canvas, floating-windows, feature-branch]
status: final
---

# Workbench — Infinite Canvas 3D Tracker Workspace

## Task

Implement and merge `feature/workbench-mode`: an infinite Pixi.js canvas with floating,
draggable/resizable windows that replaces the fixed single-view layout. The "3D" effect
is CSS `perspective` tilt on the canvas + a CSS CoverFlow carousel for view switching.

## Branch / Worktree

- **Branch:** `feature/workbench-mode`
- **Worktree path:** `.worktrees/workbench/`
- **Base branch:** `main`
- **Status:** 38 files changed vs main, 3749 insertions / 3090 deletions

To work on it:
```bash
cd /Users/spot/Code/DEViLBOX/.worktrees/workbench
```

## Critical File Paths

### Workbench Core (`src/pixi/workbench/`)

| File | Purpose |
|------|---------|
| `WorkbenchContainer.tsx` | **Entry point.** Infinite canvas root. Pan/zoom camera, spring focus, Exposé (Tab), snap guide fade, WorkbenchContext. |
| `PixiWindow.tsx` | **Floating window chrome.** Title bar drag, 8 resize handles, spring pop-in/out, squash-and-stretch on landing, momentum throw, edge bounce. |
| `CoverFlowOverlay.tsx` | **CSS 3D carousel.** Perspective view-selector overlay. Arrow keys, touch/mouse drag with vinyl-scratch velocity, click to select. |
| `WorkbenchExpose.ts` | Camera math: `fitAllWindows()`, `fitWindow()`, `springCameraTo()`, `BUILTIN_WORKSPACES` presets. |
| `springPhysics.ts` | Physics library: `springEase()`, `VelocityTracker`, `stepMomentum()`, `applyEdgeBounce()`, `squashStretch()`. |
| `windowSnap.ts` | Edge-to-edge snap detection. Tests dragged window edges against other windows + grid. Returns snap position + guide lines. |
| `WorkbenchTilt.ts` | CSS `perspective(1200px) rotateY rotateX` tilt on Pixi canvas. Cursor parallax ±3°. Spring in (450ms) / out (380ms). |
| `WorkbenchCamera.ts` | `applyTransform(container, camera)` — applies scale+translate to Pixi world container. |
| `WorkbenchBackground.tsx` | Infinite tiled/grid background; updates on camera change. |
| `WorkbenchMinimap.tsx` | Minimap overlay showing window positions at zoomed-out scale. |
| `WindowTether.tsx` | Line drawn between two related windows (e.g. Instrument ↔ Tracker) with scale awareness. |
| `workbenchSounds.ts` | UI SFX: `playWindowOpen/Close/FocusZoom/CoverSelect/Snap()`. |

### State

| File | Purpose |
|------|---------|
| `src/stores/useWorkbenchStore.ts` | Zustand store: camera (x,y,scale), window states (x,y,w,h,zIndex,visible,minimized), workspace snapshots, 3D tilt state, grid/snap settings. |

### Integration Points

| File | Purpose |
|------|---------|
| `src/pixi/PixiRoot.tsx` | Replaced single-view with `<WorkbenchContainer>` as main content area. |
| `src/pixi/shell/PixiNavBar.tsx` | Nav buttons open/focus workbench windows instead of switching views. |
| `src/pixi/shell/PixiStatusBar.tsx` | Shows active workspace name, zoom level. |
| `src/components/dialogs/SettingsModal.tsx` | Added 3D tilt toggle to settings. |
| `src/stores/useSettingsStore.ts` | Added `workbenchTilt: boolean`, `workbenchSnap: boolean`, `workbenchSounds: boolean`. |

## Window IDs

```typescript
type WindowId = 'tracker' | 'pianoroll' | 'arrangement' | 'dj' | 'vj' | 'instrument';
```

Default layout (world units):
- `tracker`: 40,40 — 900×600 — visible
- `instrument`: 980,40 — 700×260 — visible
- `pianoroll`: 980,300 — 700×400 — hidden
- `arrangement`: 40,680 — 900×300 — hidden
- `dj`: 40,40 — 1100×500 — hidden
- `vj`: 800,40 — 600×400 — hidden

## Built-in Workspace Presets

Defined in `WorkbenchExpose.ts` as `BUILTIN_WORKSPACES`:
- **Compose** — Tracker + Instrument (default, 100% zoom)
- **Mix** — DJ + Tracker + Instrument
- **Full** — All 6 windows at 55% zoom

## Architecture Overview

```
PixiRoot
└── WorkbenchContainer (provides WorkbenchContext)
    ├── WorkbenchBackground (infinite tiled bg)
    ├── [world container — scaled/translated by camera]
    │   ├── PixiWindow("tracker")
    │   │   └── PixiTrackerView
    │   ├── PixiWindow("instrument")
    │   │   └── PixiInstrumentView
    │   ├── WindowTether (tracker ↔ instrument)
    │   └── ... (pianoroll, dj, vj, arrangement)
    ├── WorkbenchMinimap (overlay, absolute)
    └── CoverFlowOverlay (DOM singleton, portal)

WorkbenchTilt (applied directly to Pixi canvas DOM element via CSS transform)
```

## Recent Changes (last 6 commits on branch)

1. `14f81438` — fix: eliminate all visible= BindingErrors on layout containers
2. `69a2f067` — feat: add 3D tilt toggle to settings modal
3. `8ba191dc` — fix: PixiDropdownPanel BindingError (alpha+renderable instead of visible)
4. `26174f36` — fix: guarantee webgl mode on every startup regardless of localStorage
5. `c8246118` — fix: PixiSelect BindingError; default to workbench mode on startup
6. `74e81a52` — feat: infinite canvas workbench with floating windows (main implementation)

## Known Issues / Next Steps

1. **BindingError audit** — Several Pixi Yoga layout containers throw `BindingError` when
   `visible=false` is used. Pattern fix: use `alpha=0` + `renderable=false` instead.
   Commits 14f8 and 8ba1 address most of these; more may exist in window content views.

2. **Merge readiness** — The branch includes unrelated fixes from `main` (FurnaceLynx,
   dev.sh rewrite, PixiNumericInput, PixiFT2Toolbar). A clean merge or cherry-pick of
   workbench-specific commits is recommended if main has diverged significantly.

3. **Type-check** — Run `npm run type-check` from the worktree root before merging.
   Recent PixiPitchSlider (`onRightClick` / `onContextMenu` mismatch) and
   PixiMusicLineTrackTable (unused `theme`) errors exist in main — verify they're
   resolved in this branch.

4. **CoverFlow touch support** — Touch drag implemented with vinyl-scratch velocity.
   Needs testing on actual touch devices (currently only tested on trackpad).

5. **Minimap** — `WorkbenchMinimap.tsx` exists but integration to show/hide via store
   may be incomplete. Check `useWorkbenchStore.minimapVisible` wiring.

6. **Sound effects** — `workbenchSounds.ts` uses `new Audio()` with placeholder paths.
   Wire to actual audio assets or remove before shipping.

## Key Patterns / Gotchas

- **Yoga `visible` prop causes BindingError** — never use `visible` on layout containers
  in `@pixi/layout`. Use `alpha + renderable` instead.

- **World units vs screen units** — all window positions/sizes in store are world units.
  Camera scale converts: `screenX = (worldX + camera.x) * camera.scale`.

- **Spring physics are ref-based** — `springPhysics.ts` functions take start/target/
  velocity and return next state. Call them from `useEffect` + `requestAnimationFrame`.
  Don't put spring state in Zustand (too slow).

- **CSS 3D tilt is on the DOM canvas element** — `WorkbenchTilt.ts` grabs
  `document.querySelector('canvas')` and applies CSS transform directly. This means
  it works outside React/Pixi, but is fragile if there are multiple canvases.

- **WorkbenchContext** — provides `{ camera, focusWindow(id), setSnapLines(lines) }`.
  PixiWindow children can call `focusWindow(myId)` to spring-animate camera to themselves.
