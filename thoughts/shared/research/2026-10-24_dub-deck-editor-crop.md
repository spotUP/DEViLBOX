---
date: 2026-10-24
topic: Dub deck growth vs pattern editor - crop from bottom, edit row pinned to bottom of visible area
status: research
---

# Findings (all paths under src/)

1. Layout container
- components/tracker/TrackerView.tsx:496 column `relative flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden` holds editor then deck.
- Editor wrapper TrackerView.tsx:630 (`relative flex-1 min-h-0 flex flex-col`) and :131 (`flex-1 min-h-0`) -> PatternEditorCanvas. It takes whatever height is left.
- Dub deck: TrackerView.tsx:668-671 `<ResponsivePanel id="dub-deck"><DubDeckStrip/>`. Strip root components/dub/DubDeckStrip.tsx:1784 `shrink-0 ... overflow-y-auto max-h-[calc(var(--app-vh)*0.75)]` (comment :1776: strip takes the height it needs, editor absorbs the rest). So deck can take up to 75% of viewport; editor flex-1 shrinks.

2. Visible rows / edit row
- Nothing is scaled vertically. Row height is fixed (24 * fitScale, PatternEditorCanvas.tsx:1552). fitScale (:433-513, :528) is a HORIZONTAL channel-fit scale only. What the owner sees as "shrink" is the grid container getting shorter while the edit row stays at height/2, so the window crops equally top and bottom around the centre.
- Container height -> ResizeObserver PatternEditorCanvas.tsx:2948-2960 -> setDimensions (also mobile path :2254-2265); sent to worker (layoutKey :2510; worker size msg workers/tracker-render.worker.ts:185-187, resize :116/:124/:258).
- Centre row is computed independently in EACH of these (no shared helper):
  - engine/renderer/TrackerGLRenderer.ts:476-482 (visibleLines, topLines=floor/2, centerLineTop=floor(height/2)-rowH/2, baseY); highlight bar :600, caret :659.
  - engine/renderer/TrackerCanvas2DRenderer.ts:171-173 (halfVisible) and :474 (centerY).
  - workers/tracker-render.worker.ts:350-351 (hitTest).
  - PatternEditorCanvas.tsx: :643-644, :828-829, :1046-1048 (click/drag hit tests), :2731-2733 and :2856-2858 (overlay tops, automation overlay :2741), :3698 containerHeight prop to overlays.
  - Also automation overlay / selection code consuming overlayTop.

3. VU meters
- Overlay inside the grid container, not above it: PatternEditorCanvas.tsx:3609-3615, `absolute right-0 ... top:0, bottom:48, zIndex:1`, pointer-events-none, overflow-hidden; ChannelVUMeters.tsx:335-338 canvas height 100% of that box and sized by ResizeObserver (:129-132). They are not hidden, they just shrink with the container (meter height = container height - 48). Channel header VU indicators are separate (:3296, :3441).

4. Existing anchor for non-centre edit row
- None. grep centerRow/editRowOffset/rowOffset/scrollMode/anchor in stores/useEditorStore.ts, types/tracker.ts, UI store: no field. `followPlayback` (useEditorStore.ts:52,168,240; types/tracker.ts:541) only chooses cursor vs playback row, not position. `rowOffset` hits are local hit-test variables.

5. Plan
- Add ONE pure helper (e.g. lib/tracker/editRowAnchor.ts) `editRowTop(height, rowH, constrained)` returning centerLineTop; replaces every `Math.floor(h/2) - rowH/2` listed in item 2 (renderers, worker, PatternEditorCanvas hit tests/overlays). It is the single owner of edit-row position.
- Add `editRowAnchor: 'center' | 'bottom'` to the renderer layout message (worker-types.ts, OffscreenBridge) and as a ref in PatternEditorCanvas; renderers use it for topLines/baseY (visible rows above = floor((H - rowH)/rowH) when bottom).
- Decide `constrained` once, in PatternEditorCanvas from `dimensions.height` vs a threshold (natural height = visible-rows needed, or a store flag set by TrackerView when the deck exceeds a share of --app-vh). Keep it in one derived value, not per renderer.
- VU meters: keep overlay, but change `bottom: 48` box (:3609) to a fixed height floor (min-height, or size from the same constrained value) and give the grid container a min height >= VU height + edit row so it never drops below; the extra deck height then scrolls/clips at TrackerView.tsx:496 instead of squeezing.
- Consumers to update: TrackerGLRenderer, TrackerCanvas2DRenderer, worker hitTest, PatternEditorCanvas hit tests and overlay tops. A test should drive PatternEditorCanvas with a short container and assert the edit row top equals height-rowH and VU box height unchanged.

## Decision (owner, 2026-10-24)

- Edit row: stays at its deck-closed screen position; rows below it are cut first. Once the deck reaches it, the edit row pins to the bottom edge of the grid. Upper part of the grid never moves.
- VU meters: keep fitting the visible grid area (current behaviour, no change).

## Design

- One pure helper `src/lib/tracker/editRowAnchor.ts`:
  `editRowTop(height, rowH, referenceHeight = height) = Math.min(Math.floor(referenceHeight / 2) - rowH / 2, height - rowH)`.
  With `referenceHeight === height` it equals today's `Math.floor(h/2) - rowH/2`, so deck-closed behaviour is unchanged.
- `referenceHeight` = grid height + dub deck height. Closing the deck gives exactly its height back to the flex-1 editor column, so the sum is the deck-closed grid height. Deck height comes from a ResizeObserver on the deck element (0 when hidden), published once in a store; PatternEditorCanvas reads it.
- Every `/2` site from item 3 calls the helper (GL renderer, Canvas2D renderer, worker hit test, PatternEditorCanvas). The worker gets `referenceHeight` through the existing size/layout message.
- Test: helper unit test (deck closed equals old formula; deck mid; deck large pins to `height - rowH`), plus one wiring test proving PatternEditorCanvas sends the deck-derived reference height to the renderer.
