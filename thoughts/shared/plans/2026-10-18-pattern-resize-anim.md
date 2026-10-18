---
date: 2026-10-18
topic: PATTERN-RESIZE-ANIM
status: plan (ready for implement)
research: thoughts/shared/research/2026-10-18_pattern-resize-anim.md
ledger: thoughts/spot/todos.md (PATTERN-RESIZE-ANIM)
---

# Plan: animate pattern editor resizes and layout changes

## Goal

Every layout change of the pattern grid (zoom, fit toggle, column visibility,
panel open/close, window resize, song load) settles in one 150 ms ease-out
motion instead of a sequence of partially-updated frames. The worker receives
one `layout` message per React commit, so it always knows the final target
before it starts moving.

## Owner decisions (2026-10-18, settled)

| Decision | Value |
|----------|-------|
| Which triggers animate | All four groups: zoom + fit toggle; column visibility; panel open/close + window resize with fit on; song load with a layout change |
| Duration | 150 ms, cubic ease-out |
| Settle point | One batched `layout` message per React commit (replaces the uiState / channelLayout / scale / resize fan-out and the double resize post) |
| Song load with a channel-count change | Hold the old picture until the batched layout lands, then fade the new picture in; no width tween across a different channel count |
| Reduced motion | `prefers-reduced-motion: reduce` read once on the main thread, carried in `init`; the worker snaps |

## Design decisions made in this plan (no open questions)

1. **Geometry tweens, canvas size snaps.** The worker resizes the renderer to
   the target `w/scale x h/scale` at `dpr*scale` the moment a `layout`
   message arrives (as today). Only the draw geometry (row height, channel
   offsets, channel widths, total width, all in canvas px) is interpolated,
   then divided by the target scale at draw time through `scaledLayout()` /
   `scaledUi()`. Reason: `TrackerGLRenderer.resize` reallocates the drawing
   buffer and rebuilds the glyph atlas whenever `dpr` changes
   (`TrackerGLRenderer.ts:381-396`); doing that per frame for 9 frames is the
   cost we must not pay. Consequence: glyph size snaps to the target scale on
   frame one while columns and rows glide into place. At the scale ranges the
   fit mode uses (floor `FIT_SCALE_FLOOR` to 1) that is at most a 2 px change
   per character, invisible against a 150 ms column move.

2. **Channel-count change = fade-in, not a width tween.** When the number of
   offsets differs between the current draw geometry and the target, the
   geometry snaps and the new picture fades in from the theme background over
   150 ms. The fade is one full-canvas rect in the background colour with
   alpha `1 - eased(t)` drawn last through the existing rect batch
   (`TrackerGLRenderer` rect program, `TrackerCanvas2DRenderer` `fillRect`).
   No shader change, no texture copy of the old frame. The old frame cannot be
   kept anyway: a channel-count change on song load also changes `w`
   (research: 1261 to 1137 px), and `resize` clears the buffer.

3. **Tween lives in one pure module.** `src/engine/renderer/layoutTween.ts`
   holds the interpolation state and math; the worker calls it from its
   existing rAF `tick`. The module has no DOM or GL dependency, so it gets
   unit tests like `layoutHold.ts`.

4. **One main-thread helper builds the message.** `PatternEditorCanvas.tsx`
   gets `buildLayoutMsg()` reading only refs (`dimensionsRef`, `fitScaleRef`,
   `snapshotUIRef`, `snapshotLayoutRef`) so the ready callback, the format
   mode effects and the playback rAF can post the same message shape without
   stale closures. One `useLayoutEffect` posts it per commit; store
   subscriptions that previously posted `uiState` now bump a `layoutTick`
   state so that the commit (and only the commit) posts.

5. **No change to the DJ deck worker.** `readonly-pattern.worker.ts` has its
   own message types (`readonly-pattern.worker.ts:47`) and does not import
   `TrackerWorkerMsg`; it keeps `resize`.

6. **hitTest uses the target layout** (`layout`, not the tweened draw
   layout). A click during the 150 ms resolves to where the cell will be,
   which is where it is by the time the cursor is drawn.

7. **Worker-side change detection.** A `layout` message whose target equals
   the current draw geometry (same row height, same offsets/widths by value,
   same scale) starts no tween: `dirty = true` only. Cell edits re-run the
   posting effect (the `pattern` dependency) and must not restart animation.

8. **Knob perf invariant kept.** With no tween active, the rAF tick does the
   same two checks it does today; the `playback` message path is untouched;
   no new per-frame allocation (the interpolated arrays are reused).

## Message order after this plan

Per React commit, in this order:

1. `patterns` (sync, from `feedWorkerFromTracker`, carries `awaitLayout`) when the tracker store changed.
2. `layout` (from the single `useLayoutEffect`) when any of: dimensions, `fitScale`, `snapshotLayout` identity, `pattern` identity with the owed flag, `layoutTick`, format-mode columns changed.

`layout` carries `{ w, h, dpr, scale, uiState, channelLayout }`. The worker:
resizes the renderer if `w`/`h`/`dpr`/`scale` changed, releases the layout
hold, and retargets the tween.

## Files

| File | Change |
|------|--------|
| `src/engine/renderer/worker-types.ts` | Add `LayoutMsg` member `layout`; remove `resize`, `scale`, `uiState`, `channelLayout` members; add `reducedMotion` to `init` |
| `src/engine/renderer/layoutTween.ts` (new) | `LayoutTween` class: retarget, sample, fade |
| `src/engine/renderer/worker-types.ts` | Add `TrackerRenderInput` (the inline `opts` type of both renderers' `render`, lifted out) with optional `fade?: number` |
| `src/engine/renderer/TrackerGLRenderer.ts` | `render(opts: TrackerRenderInput)`; honours `opts.fade` (full-canvas bg rect via `addRect` at the end) |
| `src/engine/renderer/TrackerCanvas2DRenderer.ts` | `render(opts: TrackerRenderInput)`; honours `opts.fade` (`globalAlpha` + `fillRect` at the end) |
| `src/workers/tracker-render.worker.ts` | `layout` handler, tween in `tick`, `scaledLayout`/`scaledUi` read tween output, `reducedMotion` |
| `src/components/tracker/trackerWorkerFeed.ts` | posts `patterns` only; signature loses `snapshotUI` |
| `src/components/tracker/PatternEditorCanvas.tsx` | `buildLayoutMsg`, one posting effect, `layoutTick`, remove `scale`/`resize`/`uiState`/`channelLayout` posts, `reducedMotion` in init |
| `src/engine/renderer/__tests__/layoutTween.test.ts` (new) | tween math |
| `src/workers/__tests__/trackerWorkerTweensLayout.test.ts` (new) | reachability through the worker's real `onmessage` + rAF loop |
| `src/components/tracker/__tests__/patternEditorPostsOneLayoutPerCommit.test.tsx` (new) | reachability through `PatternEditorCanvas` |
| `src/components/tracker/__tests__/fitAllChannelsReachesTheRenderer.test.tsx` | read `layout` instead of `scale`/`uiState`/`channelLayout` |
| `src/components/tracker/__tests__/orderMatrixFollowsZoomSlider.test.tsx` | same |
| `src/components/tracker/__tests__/unusedChipChannelsAreHidden.test.tsx` | same |
| `src/lib/song/__tests__/loadingASongDrawsTheNewLayoutOnce.test.ts` | worker model listens for `layout`; feed signature |
| `docs/MCP_DEBUGGING_GUIDE.md` or `docs/CONTROL_PATTERNS.md` | not touched; the worker protocol is documented in `worker-types.ts` comments |

---

## Phase 1: protocol and batching (main thread)

### 1.1 `src/engine/renderer/worker-types.ts`

Replace the four members `resize`, `scale`, `uiState`, `channelLayout` of
`TrackerWorkerMsg` (`worker-types.ts:181-186`) with one:

```ts
/**
 * Everything that shapes the grid, posted once per React commit so the worker
 * tweens toward one settled target (see layoutTween.ts). Sizes in canvas (CSS)
 * px; `scale` is the fit-all-channels pattern scale (<= 1).
 */
export interface LayoutMsg {
  type: 'layout';
  w: number;
  h: number;
  dpr: number;
  scale: number;
  uiState: UIStateSnapshot;
  channelLayout: ChannelLayoutSnapshot;
}
```

and in the union: `| LayoutMsg`. Add to the `init` member:

```ts
      /** `prefers-reduced-motion: reduce` at mount: layout changes snap instead of tweening. */
      reducedMotion?: boolean;
```

Keep `scale?` on `init` (the worker still needs the initial scale before the
first `layout`).

### 1.2 `src/components/tracker/trackerWorkerFeed.ts`

```ts
export function feedWorkerFromTracker(
  s: TrackerFeedState,
  prev: TrackerFeedState,
  post: (msg: TrackerWorkerMsg) => void,
  snapshotPatterns: () => PatternSnapshot[],
): boolean {
  if (s.patterns === prev.patterns && s.currentPatternIndex === prev.currentPatternIndex) return false;
  const awaitLayout = layoutInputsChanged(prev, s);
  post({ type: 'patterns', patterns: snapshotPatterns(), currentPatternIndex: s.currentPatternIndex, awaitLayout });
  return awaitLayout;
}
```

The `uiState` post goes: the commit that follows the store change posts
`layout`, which carries the ui snapshot. Update the one caller in
`PatternEditorCanvas.tsx` (~2073-2082) and the test
`loadingASongDrawsTheNewLayoutOnce.test.ts` (it passes a `snapshotUI`).

### 1.3 `src/components/tracker/PatternEditorCanvas.tsx`

**Refs for the builder.** Next to `fitScaleRef` (`:512-514`) add:

```ts
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;
```

Next to `snapshotLayoutRef` (`:1618-1619`) add:

```ts
  const snapshotUIRef = useRef(snapshotUI);
  snapshotUIRef.current = snapshotUI;

  /** The one message that shapes the grid; every post site uses it so the worker
   *  never sees a partial target (zoom without its layout, size without its scale). */
  const buildLayoutMsg = useCallback((): LayoutMsg => ({
    type: 'layout',
    w: Math.max(1, dimensionsRef.current.width),
    h: Math.max(1, dimensionsRef.current.height),
    dpr: window.devicePixelRatio || 1,
    scale: fitScaleRef.current,
    uiState: snapshotUIRef.current(),
    channelLayout: snapshotLayoutRef.current(),
  }), []);
```

`snapshotUI` is declared at `:1522` and `snapshotLayoutRef` at `:1618`, both
before this point; `fitScaleRef` at `:512`. Import `LayoutMsg` from
`@engine/renderer/worker-types`.

**`layoutTick` state.** Near `dimensions` (`:216`):

```ts
  // Store changes that reshape the grid (hex mode, zoom, column visibility,
  // ghost patterns, ...) re-render through this tick so the ONE posting effect
  // below sends them with the layout they belong to.
  const [layoutTick, setLayoutTick] = useState(0);
  const requestLayoutPost = useCallback(() => setLayoutTick(t => t + 1), []);
```

**Store subscriptions** (`:2090` editor store uiState, `:2128` UI store,
`:2136` settings store): replace each `bridgeRef.current?.post({ type: 'uiState', uiState: snapshotUI() })`
with `requestLayoutPost()`. The conditions stay as they are.

**Tracker store subscription** (`~2073-2082`): drop the `snapshotUI` argument
of `feedWorkerFromTracker`. `layoutOwedRef.current = true` stays.

**Ready callback** (`:1929`): replace
`bridge.post({ type: 'channelLayout', channelLayout: snapshotLayoutRef.current() })`
with `bridge.post(buildLayoutMsg())`. The `previewCells` post stays.

**Init post** (`:1984-2017`): add after `scale: fitScaleRef.current,`:

```ts
          reducedMotion: typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
```

**The posting effect.** Replace the `channelLayout` `useLayoutEffect`
(`:2447-2469`) with:

```ts
  useLayoutEffect(() => {
    const bridge = bridgeRef.current;
    const owed = layoutOwedRef.current;
    layoutOwedRef.current = false;
    if (owed) {
      // (unchanged scroll clamp block)
    }
    if (owed || postedLayoutFnRef.current !== snapshotLayout || postedLayoutKeyRef.current !== layoutKey) {
      postedLayoutFnRef.current = snapshotLayout;
      postedLayoutKeyRef.current = layoutKey;
      bridge?.post(buildLayoutMsg());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotLayout, pattern, layoutKey]);
```

where, just above it:

```ts
  // Every non-layout input of the layout message, folded into one dependency.
  const layoutKey = `${dimensions.width}x${dimensions.height}@${fitScale}#${layoutTick}`;
  const postedLayoutKeyRef = useRef('');
```

`snapshotUI` identity changes with `isFormatMode`/`formatColumns`, which the
format-mode effect (next item) covers. The canvas CSS size sync that lived in
the `[dimensions]` effect moves into the ResizeObserver callback only (it is
already done there at `:2880-2884`); the `[dimensions]` effect (`:2901-2909`)
and the `[fitScale]` effect (`:2896-2898`) are deleted. In the ResizeObserver
callback (`:2877`) delete the `bridgeRef.current?.post({ type: 'resize', ... })`
line; `setDimensions` stays and drives the posting effect.

**Format mode effect** (`:2472-2484`):

```ts
  useEffect(() => {
    if (!isFormatMode) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.post({ type: 'patterns', patterns: snapshotFormatPatterns(), currentPatternIndex: 0 });
    bridge.post(buildLayoutMsg());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormatMode, formatColumns, formatChannels]);
```

**Playback rAF format-channel block** (`:2560-2565`): replace
`bridge.post({ type: 'channelLayout', channelLayout: snapshotLayout() })` with
`bridge.post(buildLayoutMsg())`.

**Other post sites** (`:2489`, `:2504`, `:2608`, `:2622`, `:2753`, dragOver,
previewCells, theme, scroll, cursor, selection, playback, hitTest): unchanged.
After the edit, `grep -n "type: 'uiState'\|type: 'channelLayout'\|type: 'scale'\|type: 'resize'" src/components/tracker/PatternEditorCanvas.tsx`
must print nothing, and `npm run type-check` enforces it through the union.

### 1.4 Worker, minimal handler (keeps the app working before Phase 2)

In `tracker-render.worker.ts` replace the `resize`, `scale`, `uiState`,
`channelLayout` cases with:

```ts
    case 'layout': {
      if (msg.w !== width || msg.h !== height || msg.dpr !== dpr || msg.scale !== scale) {
        width = msg.w; height = msg.h; dpr = msg.dpr; scale = msg.scale;
        renderer?.resize(width / scale, height / scale, dpr * scale);
      }
      ui = msg.uiState;
      layout = msg.channelLayout;
      layoutHold.layout();
      dirty = true;
      break;
    }
```

and in `init` read `reducedMotion = msg.reducedMotion ?? false;` into a new
module-level `let reducedMotion = false;` (used in Phase 2).

### 1.5 Test migration (same phase, the union change breaks them)

- `fitAllChannelsReachesTheRenderer.test.tsx`: `workerScale()` reads the last
  `init` or `layout` message's `scale`; `lastRowHeight()` reads the last
  `init`/`layout` message's `uiState.rowHeight`; `lastLayout()` reads
  `channelLayout` of the last `init`/`layout`.
- `orderMatrixFollowsZoomSlider.test.tsx` (`:120-121`): `scale` and
  `rowHeight` both from the last `layout` message per bridge.
- `unusedChipChannelsAreHidden.test.tsx`: wherever it reads `channelLayout`
  or `uiState` messages, read the last `layout`.
- `loadingASongDrawsTheNewLayoutOnce.test.ts` (`:51-54`): the worker model's
  `channelLayout` branch becomes `layout`; the test's own posts of the layout
  become `{ type: 'layout', w, h, dpr: 1, scale: 1, uiState, channelLayout }`
  (the model only reads `channelLayout.offsets.length`); the
  `feedWorkerFromTracker` call drops its `snapshotUI` argument.
- `deckPatternViewFitsEveryChannel.test.tsx` mocks the readonly worker only;
  no change expected. Confirm with the run.

### Phase 1 success criteria

Automated:
- `npm run type-check` passes.
- `npx vitest run src/components/tracker/__tests__ src/lib/song/__tests__/loadingASongDrawsTheNewLayoutOnce.test.ts src/components/dj/__tests__/deckPatternViewFitsEveryChannel.test.tsx` passes.
- New test `patternEditorPostsOneLayoutPerCommit.test.tsx` (written in this
  phase, see Phase 4 for its body) passes: one `layout` per zoom change, one
  per resize, none of the removed types ever posted.

Manual (LOCAL, `http://localhost:5174`, dev server running):
- Load any MOD, zoom slider to 150 %: grid re-draws at the new size; no
  "half-updated" frame (columns at old width with new row height). No
  animation yet; this phase only proves the batch.
- Window resize with fit on: grid follows; console has no worker errors
  (`get_console_errors`).

---

## Phase 2: worker tween

### 2.1 `src/engine/renderer/layoutTween.ts` (new)

```ts
/**
 * Interpolates the grid geometry (row height and channel offsets/widths, all in
 * canvas px) from the picture on screen to the target of the latest `layout`
 * message over LAYOUT_TWEEN_MS with a cubic ease-out, so that zoom, fit, column
 * visibility and resize glide instead of jumping. A target with a different
 * channel count cannot be tweened column by column: the geometry snaps and the
 * new picture fades in instead (`fade` goes 0 -> 1 on the same curve).
 *
 * Owned by tracker-render.worker.ts; no DOM, no GL, so it is unit-testable.
 */
import type { ChannelLayoutSnapshot } from './worker-types';

export const LAYOUT_TWEEN_MS = 150;

export interface LayoutGeometry {
  rowHeight: number;
  layout: ChannelLayoutSnapshot;
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export function geometryEquals(a: LayoutGeometry, b: LayoutGeometry): boolean {
  if (a.rowHeight !== b.rowHeight || a.layout.totalWidth !== b.layout.totalWidth) return false;
  const ao = a.layout.offsets, bo = b.layout.offsets, aw = a.layout.widths, bw = b.layout.widths;
  if (ao.length !== bo.length || aw.length !== bw.length) return false;
  for (let i = 0; i < ao.length; i++) if (ao[i] !== bo[i] || aw[i] !== bw[i]) return false;
  return true;
}

export class LayoutTween {
  /** What the renderer draws this frame (canvas px). Identity stable while a tween runs; the arrays are rewritten in place. */
  current: LayoutGeometry;
  /** 1 = fully visible; < 1 while a channel-count change fades in. */
  fade = 1;
  private from: LayoutGeometry | null = null;
  private to: LayoutGeometry;
  private start = 0;
  private mode: 'geometry' | 'fade' | null = null;
  private readonly duration: number;

  constructor(initial: LayoutGeometry, duration = LAYOUT_TWEEN_MS) {
    this.current = initial;
    this.to = initial;
    this.duration = duration;
  }

  get active(): boolean { return this.mode !== null; }
  get target(): LayoutGeometry { return this.to; }

  /** New target from a `layout` message. `snap` (reduced motion, no renderer yet) applies it at once. */
  retarget(to: LayoutGeometry, now: number, snap: boolean): void {
    if (geometryEquals(this.to, to) && (this.mode !== null || geometryEquals(this.current, to))) {
      this.to = to; // same picture (cell edit re-post): keep whatever motion is running
      return;
    }
    this.to = to;
    if (snap || this.duration <= 0) { this.finish(); return; }
    if (to.layout.offsets.length !== this.current.layout.offsets.length) {
      this.mode = 'fade';
      this.from = null;
      this.current = { rowHeight: to.rowHeight, layout: to.layout };
      this.fade = 0;
    } else {
      this.mode = 'geometry';
      this.from = cloneGeometry(this.current); // the picture on screen now, mid-tween included
      this.current = cloneGeometry(this.current); // own arrays to rewrite per frame
      this.fade = 1;
    }
    this.start = now;
  }

  /** Advance to `now`. Returns true when the picture changed and must be drawn. */
  sample(now: number): boolean {
    if (this.mode === null) return false;
    const t = Math.min(1, (now - this.start) / this.duration);
    const e = easeOutCubic(t);
    if (this.mode === 'fade') {
      this.fade = e;
    } else {
      const f = this.from!, c = this.current, to = this.to;
      c.rowHeight = f.rowHeight + (to.rowHeight - f.rowHeight) * e;
      c.layout.totalWidth = f.layout.totalWidth + (to.layout.totalWidth - f.layout.totalWidth) * e;
      for (let i = 0; i < c.layout.offsets.length; i++) {
        c.layout.offsets[i] = f.layout.offsets[i] + (to.layout.offsets[i] - f.layout.offsets[i]) * e;
        c.layout.widths[i]  = f.layout.widths[i]  + (to.layout.widths[i]  - f.layout.widths[i])  * e;
      }
    }
    if (t >= 1) this.finish();
    return true;
  }

  private finish(): void {
    this.mode = null;
    this.from = null;
    this.current = this.to;
    this.fade = 1;
  }
}

function cloneGeometry(g: LayoutGeometry): LayoutGeometry {
  return { rowHeight: g.rowHeight, layout: { ...g.layout, offsets: g.layout.offsets.slice(), widths: g.layout.widths.slice() } };
}
```

Notes for the implementer:
- `current` keeps the same object identity for the whole tween, but
  `scaledLayout()`/`scaledUi()` memoise on identity, so the worker must pass
  a per-frame version key; see 2.2.
- `retarget` while a geometry tween runs starts from the interpolated
  picture, so a resize drag (one `layout` per ResizeObserver tick) stays
  smooth and never jumps back.
- A fade retargeted mid-fade with the same channel count: `current` already
  equals the fade target geometry, so it becomes a geometry tween from that;
  the fade restarts at 1 (visible). Acceptable: the fade had the old count's
  picture for at most a few frames.

### 2.2 `src/workers/tracker-render.worker.ts`

State:

```ts
import { LayoutTween } from '../engine/renderer/layoutTween';
let reducedMotion = false;
const tween = new LayoutTween({ rowHeight: ui.rowHeight, layout });
let drawVersion = 0; // bumps whenever tween.current is rewritten, keys the scaled* memos
```

`init`: after `layout = msg.channelLayout; scale = msg.scale ?? 1;` add
`reducedMotion = msg.reducedMotion ?? false; tween.retarget({ rowHeight: ui.rowHeight, layout }, performance.now(), true);`.

`layout` case (replaces 1.4):

```ts
    case 'layout': {
      if (msg.w !== width || msg.h !== height || msg.dpr !== dpr || msg.scale !== scale) {
        width = msg.w; height = msg.h; dpr = msg.dpr; scale = msg.scale;
        renderer?.resize(width / scale, height / scale, dpr * scale);
      }
      ui = msg.uiState;
      layout = msg.channelLayout;
      layoutHold.layout();
      tween.retarget({ rowHeight: ui.rowHeight, layout }, performance.now(), reducedMotion || !renderer);
      drawVersion++;
      dirty = true;
      break;
    }
```

This is the final form; Phase 3 adds no worker change. A song load that
changes the channel count reaches `retarget` with a different
`offsets.length` and takes the fade branch (decision 2); `layoutHold` keeps
its present API.

`tick`:

```ts
  const tick = () => {
    if (playback.isPlaying) dirty = true;
    if (tween.active && tween.sample(performance.now())) { drawVersion++; dirty = true; }
    if (dirty && layoutHold.canDraw(performance.now())) renderFrame();
    requestAnimationFrame(tick);
  };
```

`renderFrame`: `ui: scaledUi(), layout: scaledLayout(), fade: tween.fade` (the
`fade` field is used in Phase 3; pass it now so the renderers' optional field
is wired once).

`scaledLayout` / `scaledUi` read `tween.current` and memoise on
`drawVersion` + `scale` instead of source identity:

```ts
let scaledLayoutAtVersion = -1;
let scaledLayoutAt = 1;
let scaledLayoutOut: ChannelLayoutSnapshot = layout;
function scaledLayout(): ChannelLayoutSnapshot {
  const src = tween.current.layout;
  if (scale === 1 && !tween.active) return src;
  if (scaledLayoutAtVersion !== drawVersion || scaledLayoutAt !== scale) {
    scaledLayoutAtVersion = drawVersion;
    scaledLayoutAt = scale;
    scaledLayoutOut = { ...src, offsets: src.offsets.map(v => v / scale), widths: src.widths.map(v => v / scale), totalWidth: src.totalWidth / scale };
  }
  return scaledLayoutOut;
}
```

(`scaledUi` symmetrical: `{ ...ui, rowHeight: tween.current.rowHeight / scale }`
when `scale !== 1 || tween.active`, else `ui` when `tween.current.rowHeight === ui.rowHeight`.)
During a tween this allocates two small arrays per frame for 9 frames; idle
frames allocate nothing, as today.

`hitTest`: unchanged (reads `layout` = target).

### 2.3 Renderers: optional `fade`

Both renderers declare the render input inline (`render(opts: {...})`,
`TrackerGLRenderer.ts:410` and `TrackerCanvas2DRenderer.ts:136`; the Canvas2D
copy also carries `playback.songPosition?`). Lift it once into
`worker-types.ts`:

```ts
export interface TrackerRenderInput {
  patterns: PatternSnapshot[];
  currentPatternIndex: number;
  scrollX: number;
  cursor: CursorSnapshot;
  selection: SelectionSnapshot | null;
  playback: { row: number; smoothOffset: number; patternIndex: number; isPlaying: boolean; songPosition?: number };
  theme: ThemeSnapshot;
  ui: UIStateSnapshot;
  layout: ChannelLayoutSnapshot;
  dragOver: { channelIndex: number; rowIndex: number } | null;
  preview?: PatternPreviewSnapshot | null;
  /** 0..1 opacity of the drawn frame over the background; omitted = 1. */
  fade?: number;
}
```

and change both signatures to `render(opts: TrackerRenderInput): void`. At
the end of each `render`, after everything else is drawn and before the final
flush:

GL (`TrackerGLRenderer.ts`; `addRect(x, y, w, h, [r, g, b, a])` at :1010 is the
rect batch used for row backgrounds at :583, `flushRects()` at :1082; the clear
colour is chosen at :495-500):
```ts
    if (opts.fade !== undefined && opts.fade < 1) {
      // Same colour the frame was cleared with (:495-500).
      const [r, g, b, a] = ui.trackerVisualBg ? [0, 0, 0, 0.75] : colors.bg;
      this.addRect(0, 0, this.width, this.height, [r, g, b, a * (1 - opts.fade)]);
      this.flushRects();
    }
```
With an opaque theme background (`a === 1`) this is an exact fade from the
cleared frame. With `trackerVisualBg` (translucent clear, visualizer behind)
the overlay is translucent black scaled by the fade, an approximation that
is accepted: the visualizer stays visible underneath throughout.

Canvas2D (`TrackerCanvas2DRenderer.ts`; background is `theme.bg` at :174-175,
`W`/`H` are the logical size in scope):
```ts
    if (opts.fade !== undefined && opts.fade < 1) {
      ctx.globalAlpha = 1 - opts.fade;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
```
placed after the last draw and before the final `ctx.restore()`.

Both use the renderer's existing rect/fill path and background colour; no
second code path.

### Phase 2 success criteria

Automated:
- `npm run type-check`.
- `npx vitest run src/engine/renderer/__tests__/layoutTween.test.ts src/workers/__tests__/trackerWorkerTweensLayout.test.ts src/components/tracker/__tests__` passes (bodies in Phase 4).
- Worker reachability test shows: after one `layout` with a new row height
  and widths, `renderer.resize` called once, `render` called on every rAF for
  150 ms with strictly intermediate `ui.rowHeight` and `layout.offsets`, then
  exactly the target values, then no further `render` calls while idle.

Manual (LOCAL, `http://localhost:5174`):
1. Load a 4-channel MOD, fit on. Drag zoom slider 100 to 150 %: rows and
   columns glide to size over ~150 ms. PASS: one smooth motion. FAIL: a jump,
   or rows and columns arriving in different frames.
2. Toggle fit all channels off and on: same.
3. Column visibility (flag1/probability) toggle: columns slide.
4. Open and close a side panel with fit on: columns slide with the width.
5. Drag the window edge slowly: columns follow without jumping back.
6. macOS System Settings > Accessibility > Display > Reduce motion ON, reload:
   every change above snaps; no motion.
7. `get_frame_stats` before and after a zoom change while idle: frame count
   does not climb when nothing changes (perf invariant).

---

## Phase 3: song load with a layout change

### 3.1 `src/engine/renderer/layoutHold.ts`

Unchanged. `patterns(awaitLayout, now)`, `layout()` and `canDraw(now)` are
enough: the hold decides *when* the first frame of the new song draws, the
tween decides *how* it appears.

### 3.2 Worker: no further change

The Phase 2.2 `layout` case is already the final form. `LayoutTween.retarget`
chooses fade when the channel count differs, which is exactly the
`awaitLayout` case (`layoutInputsChanged` fires on channel count, collapse,
effect columns, note columns, notation; the last four keep the count and get
the geometry tween). No `heldForNewSong` flag, no new `layoutHold` getter.
Behaviour:

- Song load, count changes (research S3M 4 -> 16): `patterns(awaitLayout)`
  arrives, hold keeps the old picture; `layout` arrives (+248 ms in the
  research trace, well inside `LAYOUT_HOLD_MAX_MS`), geometry snaps, new
  picture fades in from the background over 150 ms.
- The later `layout` posts of the same load (research: resize at +273,
  channelLayout at +296, +459) retarget the tween: same count, so geometry
  tweens from the fading picture; the fade finishes on its own curve. With
  batching these collapse to at most one `layout` per commit, two or three
  commits in that trace.
- Hold timeout (`LAYOUT_HOLD_MAX_MS` 500): `canDraw` releases, the old
  patterns draw with the old geometry; when `layout` lands the fade starts.
  Unchanged safety net.

### Phase 3 success criteria

Automated:
- Worker reachability test, second case: `patterns(awaitLayout: true)` with
  16 channels, then `layout` with 16 offsets; `render` is not called between
  them; the first `render` after `layout` has `fade` < 1 and 16 offsets at
  their target; `fade` reaches 1 within 150 ms; `resize` called once.
- `loadingASongDrawsTheNewLayoutOnce.test.ts` still passes (no mixed frames).

Manual (LOCAL, `http://localhost:5174`):
1. Load a 4-channel MOD, then an S3M with 16 channels: the old grid stays
   until the new one fades in; no frame with 16 columns at 4-channel widths,
   no blank flash longer than one frame. PASS: fade only. FAIL: a jump to
   partial layout, or a long blank.
2. Reverse (16 -> 4): same.

---

## Phase 4: tests

### 4.1 `src/engine/renderer/__tests__/layoutTween.test.ts` (unit, pure)

Cases (each a separate `it`):
- `retarget` with equal geometry starts nothing (`active` false).
- Geometry tween: at `now = start + 75` the row height lies strictly between
  from and to and equals `from + (to - from) * easeOutCubic(0.5)`; at
  `start + 150` `current === target` (identity) and `active` false.
- Retarget mid-tween starts from the interpolated value (no jump back).
- Count change sets `fade` 0 and snaps geometry; `fade` is 1 at the end.
- `snap = true` applies the target at once.
- `duration = 0` applies the target at once.

### 4.2 `src/workers/__tests__/trackerWorkerTweensLayout.test.ts` (reachability, worker)

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const renders: Array<{ rowHeight: number; offsets: number[]; fade: number | undefined }> = [];
const resizes: Array<[number, number, number]> = [];
vi.mock('@/engine/renderer/TrackerGLRenderer', () => ({
  TrackerGLRenderer: class {
    resize(w: number, h: number, dpr: number) { resizes.push([w, h, dpr]); }
    render(s: { ui: { rowHeight: number }; layout: { offsets: number[] }; fade?: number }) {
      renders.push({ rowHeight: s.ui.rowHeight, offsets: s.layout.offsets.slice(), fade: s.fade });
    }
  },
}));
vi.mock('@/engine/renderer/TrackerCanvas2DRenderer', () => ({ TrackerCanvas2DRenderer: class { resize() {} render() {} } }));

const frames: FrameRequestCallback[] = [];
let now = 0;
beforeEach(() => {
  renders.length = 0; resizes.length = 0; frames.length = 0; now = 0;
  globalThis.self = globalThis as unknown as Window & typeof globalThis;
  globalThis.postMessage = vi.fn() as never;
  globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

async function bootWorker() {
  vi.resetModules();
  await import('@/workers/tracker-render.worker');
  return (msg: unknown) => (self.onmessage as (e: { data: unknown }) => void)({ data: msg });
}
function runFrame(dt: number) { now += dt; const cb = frames.shift()!; cb(now); }
```

Case 1 (geometry): `init` with 4 channels, rowHeight 24, offsets
`[40, 200, 360, 520]`, widths 160 each, w 800, h 600, dpr 1, scale 1; run one
frame (the init draw). Post `layout` with rowHeight 36, offsets
`[40, 280, 520, 760]`, widths 240, scale 1, same w/h/dpr. Run frames at 16 ms
steps for 160 ms. Assert: `resizes.length === 1` (init only); the renders
after the message have `rowHeight` increasing strictly from above 24 to 36
with at least one value strictly between; the last render has offsets exactly
`[40, 280, 520, 760]`; after two more idle frames `renders.length` does not
grow. The strictly-intermediate render IS the sentinel: nothing else in the
worker can produce a fractional row height at scale 1.

Case 2 (fade on count change): `patterns` with 16 channels and
`awaitLayout: true`; run two frames; assert no new render (hold). Post
`layout` with 16 offsets; run frames for 160 ms; assert the first render after
it has 16 offsets at target and `fade` < 1, a later one `fade === 1`, and
`resizes.length` unchanged when w/h/dpr/scale are unchanged.

Case 3 (reduced motion): `init` with `reducedMotion: true`; `layout` with a
new row height; the first render after it has the target row height; one
render only.

Case 4 (scale change resizes once): `layout` with `scale: 0.5`; exactly one
`resize(1600, 1200, 0.5)` and the final render's offsets are target / 0.5.

### 4.3 `src/components/tracker/__tests__/patternEditorPostsOneLayoutPerCommit.test.tsx` (reachability, main thread)

Copy the harness of `fitAllChannelsReachesTheRenderer.test.tsx` (bridge mock
collecting `posted`, store mocks, `ResizeObserver` stub that keeps the callback
in a variable, `mount()` with the 60 ms settle). Then:

- After mount, `posted.filter(m => ['uiState','channelLayout','scale','resize'].includes(m.type))` is empty (TypeScript already forbids them; this guards the test's own mocks).
- `const before = posted.length; await act(() => useUIStore.setState({ trackerZoom: 150, trackerScale: 1.5 }))`: exactly one new message, `type === 'layout'`, `uiState.rowHeight === 36`, `scale` equals the component's fit scale, `channelLayout.offsets.length === 4`.
- Call the captured ResizeObserver callback with width 1000 inside `act`: exactly one new `layout` with `w === 1000`, and no second one after another 60 ms (the double resize post is gone).
- `useEditorStore.setState({ columnVisibility: { flag1: true, flag2: false, probability: true } })` inside `act`: exactly one new `layout` whose `uiState.columnVisibility.flag1` is true and whose `channelLayout.widths[0]` is larger than before.
- The `init` message has `reducedMotion: false` with the default `matchMedia` stub (`useBreakpoint.test.tsx` shows the stub); with a stub returning `matches: true` for `(prefers-reduced-motion: reduce)`, a fresh mount's `init` has `reducedMotion: true`.

### 4.4 Migrations (listed in 1.5) and `loadingASongDrawsTheNewLayoutOnce.test.ts`.

### Phase 4 success criteria

Automated:
- `npm run type-check`.
- `npx vitest run src/engine/renderer/__tests__/layoutTween.test.ts src/workers/__tests__/trackerWorkerTweensLayout.test.ts src/components/tracker/__tests__ src/lib/song/__tests__/loadingASongDrawsTheNewLayoutOnce.test.ts src/components/dj/__tests__/deckPatternViewFitsEveryChannel.test.tsx`.
- `npm run lint` on the touched files.
- No full suite run; CI (`deploy.yml` test:ci) runs it on push.

Manual: the Phase 2 and Phase 3 lists, run once at the end on LOCAL
`http://localhost:5174`, then LIVE `https://devilbox.uprough.net` after the
push lands (check the bundle hash changed, not the green workflow).

---

## Reachability checklist (tick in the open during implement)

| ID | Item | Proof |
|----|------|-------|
| R1 | `PatternEditorCanvas` posts one `layout` per commit for zoom | 4.3 |
| R2 | ... for ResizeObserver resize, no double post | 4.3 |
| R3 | ... for column visibility | 4.3 |
| R4 | `init` carries `reducedMotion` from `matchMedia` | 4.3 |
| R5 | Worker tween runs on the real `onmessage` + rAF (fractional row height sentinel) | 4.2 case 1 |
| R6 | Worker resizes the renderer once per size/scale change, never per frame | 4.2 cases 1 and 4 |
| R7 | Channel-count change holds then fades | 4.2 case 2 |
| R8 | Reduced motion snaps | 4.2 case 3 |
| R9 | Idle frames draw nothing (perf invariant) | 4.2 case 1 tail |
| R10 | Song load draws no mixed frame | `loadingASongDrawsTheNewLayoutOnce` |
| R11 | Every removed message type is gone from `PatternEditorCanvas` | grep in 1.3 + type-check |
| R12 | 150 ms is the only duration constant (`LAYOUT_TWEEN_MS`) | grep `150` in the touched files |

Knob declared by the spec: duration 150 ms. Moves the output: 4.1 asserts the
mid-point value depends on `duration` (a second `LayoutTween` with 300 ms
gives a different value at 75 ms).

## Risks and their handling

- **Renderer clips text to column width?** If the GL renderer does not clip
  glyphs per channel, a scale increase (bigger glyphs on frame one, columns
  still narrow) overlaps neighbouring columns for a few frames. Check during
  Phase 2 manual item 1 at zoom 100 -> 150 with fit on. If visible, the fix is
  within decision 1: start the geometry tween from the old geometry scaled by
  `oldScale / newScale` (so columns are already wide enough for the new
  glyphs on frame one and only the remaining difference tweens). Record the
  choice in this file.
- **`pattern` dependency re-posts `layout` on every cell edit.** The worker
  compares by value (`geometryEquals`) so no tween starts; the cost is one
  snapshot per keystroke, which `uiState` already paid before this plan.
- **Format mode** posts `layout` through the same builder; `snapshotUI`
  includes `columns` there, as before.
- **Mobile canvas** (`mobileCanvas`): `fitScale` is 1 and `lnwCanvasPx` uses
  `LNW`; unchanged by this plan, the message just carries scale 1.

## Iteration log

- Pass 1: draft with worker-side scale tween; rejected (atlas rebuild per frame).
- Pass 2: geometry-only tween, canvas snaps; added glyph-size consequence and the risk item.
- Pass 3: crossfade needs the old frame as a texture; replaced by fade-in through the existing rect batch, no shader change.
- Pass 4: store subscriptions posting `uiState` outside the commit broke "one message per commit"; introduced `layoutTick` so they flow through the posting effect.
- Pass 5: worker reachability through a mocked bridge cannot prove the tween ran; added the worker-level test that imports the real worker module under node with mocked renderers and captured rAF, fractional row height as sentinel.
- Pass 6: cell edits would restart the tween through the `pattern` dependency; added `geometryEquals` short-circuit in `retarget` and the `drawVersion` memo key.
- Pass 7: consistency check against the source: both renderers declare the render input inline, so the plan lifts it into `TrackerRenderInput`; the GL rect helper is `addRect` (not `pushRect`) and the fade rect reuses the clear colour chosen at `:495-500`; dropped the `layoutHold.pending` getter and the `holding` flag, Phase 2.2 is the final worker form and Phase 3 adds no worker code.
