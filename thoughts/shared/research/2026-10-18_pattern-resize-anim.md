---
date: 2026-10-18
topic: Pattern editor resizes and layout changes - how the canvas renders them today, and what is measurably broken
status: draft
ledger: PATTERN-RESIZE-ANIM (thoughts/spot/todos.md)
---

# Pattern editor layout changes: what exists today

Owner question 2026-10-18: "can we animate the pattern editor resizes and layout changes so it looks nice instead of broken?" Layout changes named by the owner: channel count change, fit-to-view, column visibility, panel open/close, window resize, loading a song with a different pattern layout, and songs that open a pattern matrix or order view.

This document records what IS. It has three parts: the shared pipeline every layout change goes through, one section per trigger, and the live measurements taken on 2026-10-18 at `http://localhost:5174` (main at 8275c3a0a). Opinions are kept to the final "What this means for a plan" section, which the owner asked for. Anything marked UNCONFIRMED was not read or not measured; the note says where to look.

Paths are relative to `src/`. Abbreviations used for the three hot files: P = `components/tracker/PatternEditorCanvas.tsx`, W = `workers/tracker-render.worker.ts`, G = `engine/renderer/TrackerGLRenderer.ts`.

## 1. Shared pipeline (every trigger ends here)

Layout is computed on the main thread in one `useMemo` (P:417-503). Deps at P:503: pattern, columnVisibility, isFormatMode, formatColumns/formatChannels, mobileCanvas, CW, LNW, showAutomationLanes, channelLaneCounts, globalLaneVisible, `dimensions.width`, fitChannels, manualScale, visibleMask.

- `fitChannels` = `settings.fitAllChannelsTracker && !mobile` (P:413). `manualScale` = `ui.trackerZoom / 100` (P:415). `visibleMask` from `hooks/tracker/useVisibleChannelMask.ts:12` (hidden empty channels get width 0).
- Per-channel minimum widths P:456-478 (collapsed, effectCols, noteCols, flag and probability columns, automation lane). Then `fitAndStretchChannelWidths` (`components/tracker/channelLayout.ts:162-178`): `scale = fit ? fitChannelScale(...) : manualScale` (fit floor `FIT_SCALE_FLOOR = 10/14`, channelLayout.ts:95-98, 110-121), widths `floor(w * scale)`, spare width shared by `stretchChannelWidths` (channelLayout.ts:70-83). Format mode uses `formatChannelLayout` instead (P:424-436).
- There is one `scale` number. Font size is `PATTERN_FONT_PX = 14 * scale` (channelLayout.ts:86); the renderer constants `FONT_SIZE_PX = 14`, `ROW_HEIGHT = 24` (G:41, 44) never change. Font size is not in the worker protocol; scale is.

The result reaches the OffscreenCanvas worker in **separate messages from separate React phases** (protocol `engine/renderer/worker-types.ts:145-189`, handler W:83-200; the bridge `OffscreenBridge.ts:62-69` is a plain `postMessage` with no batching):

| Message | Posted from | Phase | Worker effect |
|---|---|---|---|
| `uiState` | store subscriptions P:2087-2130 | synchronous in the zustand `set`, before React renders | W:182, dirty |
| `patterns {awaitLayout}` | `trackerWorkerFeed.ts:19-36` via subscription P:2075-2082 | synchronous in the store `set` | W:128-133, hold if awaitLayout |
| `channelLayout {offsets, widths, totalWidth}` | `useLayoutEffect` P:2449-2468 | layout effect of the next commit | W:187-191, releases hold, dirty |
| `scale {scale}` | effect on `[fitScale]` P:2895-2898 | passive effect of the same commit (after the layout effect) | W:169-175 -> `renderer.resize(w/scale, h/scale, dpr*scale)`, dirty |
| `resize {w, h, dpr}` | ResizeObserver P:2868-2885 (direct) AND effect on `[dimensions]` P:2900-2908 | RO callback, then the next commit | W:161-167 -> `renderer.resize`, dirty |

Worker side:

- `renderer.resize` (G:381-396) assigns `canvas.width/height = ceil(logical * dpr)` and `gl.viewport`. Assigning `canvas.width` clears the drawing buffer. The glyph atlas is rebuilt synchronously when `atlas.dpr !== dpr` (G:393-395); because the worker passes `dpr * scale`, every scale change rebuilds the atlas, deleting the old texture first (G:400-402).
- The rAF loop (W:226-243) is always armed and draws when `dirty && layoutHold.canDraw` (W:236); `playback.isPlaying` forces dirty each tick (W:232). Every message sets dirty. So the first frame with new state lands 0-1 worker rAF after the LAST message of a change arrives; frames between messages draw whatever mix has arrived so far. Widths and offsets are applied instantly through `scaledLayout()` / `scaledUi()` (W:262-279); there is no interpolation anywhere in W or G.
- Context: `antialias false, alpha true, premultipliedAlpha false, desynchronized true`, `preserveDrawingBuffer` default false (G:287-292). Every render starts with `gl.clear` (G:496-501).
- The only stale-frame guard is `LayoutHold` (`engine/renderer/layoutHold.ts:48-63`, `LAYOUT_HOLD_MAX_MS = 500`): a `patterns` message with `awaitLayout` freezes drawing (old picture stays) until `channelLayout` arrives or 500 ms pass. `awaitLayout` is `layoutInputsChanged` (layoutHold.ts:25-37): channel count, collapsed, effectCols, noteCols, effectNotation of the current pattern. It does NOT look at column visibility, row count, scale or dimensions. Used at W:131, W:189, W:237. Test: `lib/song/__tests__/loadingASongDrawsTheNewLayoutOnce.test.ts`.
- Canvas CSS size is set on the main thread immediately in the RO callback (P:2879-2880) while the backing store changes only when the worker handles the message, so the old backing store can be shown stretched to the new CSS size for a frame.
- Main-thread fallback (iOS / no OffscreenCanvas, P:1884-1899, 2186-2229): Canvas2D renderer, own rAF capped at `MIN_FRAME_MS = 33` (P:2201), synchronous resize in its own RO (P:2186-2196).

## 2. Triggers

### 2.1 Channel count change
Sources: `loadPatterns` (`stores/useTrackerStore.ts:1965`, set at :1978-1983), `addChannel` (:1595), `removeChannel` (:1653), `addOverlayChannels` (:1639; jingle `engine/jingle/JinglePatterns.ts:203` then forces `setFitAllChannelsTracker(true)` :208-209). Path: store `set` -> `patterns` (awaitLayout true) + `uiState` synchronously -> hold -> React commit -> layout effect posts `channelLayout` (forced when owed, P:2465), passive effect posts `scale` AFTER it. `resize` is not posted unless the container width changed. Hold is released by `channelLayout`, so the new layout can be drawn at the old scale for one worker turn if the rAF tick falls between the two messages (code order only; see measurement 3.4 for the song-load case).

### 2.2 Fit toggle and tracker zoom
Fit: `settings.fitAllChannelsTracker` (`stores/useSettingsStore.ts:60, 203, 358`), UI `PatternBottomBar.tsx:40-41`, `SettingsModal.tsx:461`. Zoom: `ui.setTrackerZoom` (`stores/useUIStore.ts:387-396`) clamps and TURNS FIT OFF (:392); MCP `set_tracker_zoom` at `bridge/MCPBridge.ts:375`. Messages: `uiState` first (trackerZoom/trackerScale subscription P:2125-2127), `channelLayout` second, `scale` last. No hold. Physical canvas size is unchanged ((w/scale) * (dpr*scale)) but `renderer.resize` still reassigns `canvas.width/height` (W:170-173), clearing the buffer, and rebuilds the atlas. Measured in 3.1.

### 2.3 Column visibility
Source: `useEditorStore.ts:243 setColumnVisibility` (MCP `bridge/handlers/writeHandlers.ts:1437`, UI `PatternBottomBar.tsx:29`, `useInstrumentStore.ts:352` flips flag1/flag2 per song). `uiState` is posted synchronously (P:2089-2090), then `channelLayout` from the layout effect (showAcid/showProb widen min widths P:450-451, 471-476), `scale` only if fitScale changed. No hold (layoutInputsChanged ignores columnVisibility), so the worker can draw the new column set with the old widths for a frame. Measured in 3.2.

### 2.4 Side or bottom panel open/close
Containers in `components/tracker/TrackerView.tsx`: flex row :485; order sidebar `ResponsivePanel` :488-491 (only `viewMode === 'tracker' && !editorFullscreen`); pattern options :652-655; dub deck :668; minimap :675; pitch :682; instrument panel :705-714 (toggle :692). Editor wrapper `flex-1 min-w-0 min-h-0` (:494, :596). Any of these changes the container size -> RO -> `resize` posted twice (direct, then effect), `channelLayout` + `scale` from the commit if the width changed. Height-only changes reallocate the canvas without a layout change (layout deps use `dimensions.width` only). No debounce; no CSS width transition on any of these panels was found in `components/tracker` (only colour/hover transitions, e.g. `AdvancedEditPanel.tsx:59`, `PatternBottomBar.tsx` chevrons). Whether `ResponsivePanel.tsx:43-96` animates width: UNCONFIRMED (not read).

### 2.5 Window resize and devicePixelRatio
Same as 2.4 through the container RO. First layout: init deferred by `setTimeout(0)` (P:1967-1998) reading `clientWidth/Height`, RO corrects. `dpr` is read only at event time (P:1975, 2874, 2902); no `matchMedia('resolution')` listener in `components/tracker`, `workers`, or G (UNCONFIRMED across the rest of `src`). Measured in 3.3.

### 2.6 Loading a song with a different layout
Loader -> `loadPatterns` (`useTrackerStore.ts:1965`: patterns, currentPatternIndex 0, cursor reset :1984, `autoNameChannels` via `setTimeout(0)` :2013). Synchronously: `patterns` (awaitLayout if channel count / collapsed / effectCols / noteCols / effectNotation changed) + `uiState`. Then React: the layout effect clamps `scrollLeft` (posts `scroll`, P:2453-2463) and posts `channelLayout` (:2465-2467), releasing the hold; passive effects post `scale` and possibly `resize`. Row-count-only changes have `awaitLayout = false` and draw immediately. Column set is global editor state, not per song, except the flag1/flag2 flip (2.3). Format-mode editors use the effect P:2475-2486 (posts uiState, patterns WITHOUT awaitLayout, channelLayout) plus a rAF-time repost P:2555-2567. Measured in 3.4 and 3.5.

### 2.7 Pattern matrix / order view
`ui.trackerViewMode` (`stores/useUIStore.ts:24, 204, 319`; views `stores/uiViews.ts:16`: tracker, grid, pianoroll, matrix, sunvox). Setters: `constants/viewOptions.ts:55`, MCP `set_active_view` (`writeHandlers.ts:1223`), `useFormatStore.ts:1383` (forces 'tracker' for non-classic editors), `lib/song/songBranches.ts:744, 796` (SunVox sets 'sunvox'). **No song-load path sets 'matrix'**; only the user or MCP does. `TrackerView.tsx:643` renders `<PatternMatrix/>` INSTEAD of the editor, so `PatternEditorCanvas` unmounts (worker disposed, canvas removed, cleanup ~P:2133-2146) and a fresh worker + canvas + `init` is built on return. The order sidebar also leaves in matrix mode (:488-491), so the editor width changes by the sidebar width on return (2.4 path after remount). Per-format in-view order matrices (`gtultra/GTOrderMatrix.tsx`, `sidfactory2/SF2OrderMatrix.tsx`, `cheesecut/CCOrderMatrix.tsx`, `tfmx/TFMXTrackstepMatrix.tsx`, `shared/SongOrderMatrix.tsx`, `tracker/MusicLineTrackTableEditor.tsx`) live beside the canvas; which of them use `PatternEditorCanvas` in format mode: UNCONFIRMED.

### 2.8 Readonly worker (DJ decks, remote view)
`workers/readonly-pattern.worker.ts` + `components/tracker/ReadOnlyPatternCanvas.tsx` (consumers `DeckPatternDisplay.tsx`, `RemotePatternView.tsx`). Same `TrackerGLRenderer`. Own protocol (init, pattern, playback, resize; worker :96-125). Layout is built on the main thread and posted with `pattern`; `resize` posts `w/sc, h/sc, dpr*sc` (R:283-287). No hold, no scale message, unconditional `renderFrame` every rAF (:131-137) with the dirty check inside (:141-142).

## 3. Live measurements (2026-10-18, Chrome, zoom 125 so fit was OFF for 3.2-3.5)

Method: `Worker.prototype.postMessage` patched in the page to log message type and `performance.now()` for resize/scale/channelLayout/patterns/init/uiState (`window.__layoutLog`). Times in ms relative to the first message of each change. `get_frame_stats` returned 0 samples (no frame counter is wired for the tracker worker), so worker-side draw times are NOT measured; only message arrival order and spacing.

### 3.1 Zoom 100 -> 125 (`set_tracker_zoom 125`)
| +ms | message |
|---|---|
| 0 | uiState |
| 15.5 | channelLayout |
| 15.7 | uiState |
| 16.5 | uiState |
| 16.6 | scale 1.25 |

No `resize`. `uiState` (new trackerScale / row height) leads `channelLayout` + `scale` by ~15 ms, about one frame at 60 Hz. channelLayout and scale are 1.1 ms apart (same commit). Worst case: one frame drawn with the new uiState and the old widths/scale.

### 3.2 Column visibility (volume off)
| +ms | message |
|---|---|
| 0 | uiState |
| 3.8 | channelLayout |

No `scale` (fit off), no `resize`. 3.8 ms gap; a frame can fall between them (new column set, old widths).

### 3.3 Window resize (1100x800 window; canvas 1047.1 x 457.5 CSS px, dpr 2)
| +ms | message |
|---|---|
| 0 | resize |
| 58.5 | resize (identical values) |

No `channelLayout`, no `scale`: with fit OFF a width change does not change the layout, only the canvas allocation. The canvas is reallocated (cleared) twice for one resize, 58 ms apart; the second clear is the `[dimensions]` effect (P:2900-2908). With fit ON a `channelLayout` + `scale` pair would follow the first resize by one commit: UNCONFIRMED (not measured; zoom turned fit off).

### 3.4 Song load, same channel count (4 -> 4, `flo boarding - level 1.xm`)
| +ms | message |
|---|---|
| 0 | patterns (awaitLayout false) |
| 4 | uiState |
| 115 | channelLayout |
| 132 | resize (canvas width 1256.1 -> 1261.3) |
| 146 | channelLayout |
| 165 | patterns (awaitLayout false) |
| 169 | uiState |
| 170 | resize |
| 198 | channelLayout |

Nine messages over ~200 ms with no hold (channel count unchanged). Two `patterns` posts 165 ms apart; the second most likely is `autoNameChannels` (`useTrackerStore.ts:2013`, `setTimeout(0)`) writing channel names into the store: UNCONFIRMED (inferred from the source, not traced). The container width changed by ~5 px on load (something beside the editor resized; which element: UNCONFIRMED).

### 3.5 Song load, channel count change (4 -> 16, `nightmare on acid.s3m`)
| +ms | message |
|---|---|
| 0 | patterns (awaitLayout TRUE, hold starts) |
| 27 | uiState |
| 248 | channelLayout (hold released) |
| 273 | resize (canvas width 1261.3 -> 1137.7) |
| 296 | channelLayout |
| 344 | patterns (awaitLayout false) |
| 371 | uiState |
| 372 | resize |
| 459 | channelLayout |

This is the owner's "broken" case, measured: the hold protects frames 0-248 ms (old song stays on screen), then releases on the FIRST `channelLayout`, but layout keeps changing for another 211 ms: the container shrinks by 124 px at +273 (a wider element appeared beside the editor; which one: UNCONFIRMED, likely the order list growing to 51 positions or a scrollbar), the widths are recomputed twice more, and a second `patterns` post arrives at +344. Between +248 and +459, at 60 Hz, up to ~12 frames can be drawn with intermediate layouts: 16 channels fit to the old 1261 px width, then a cleared canvas at the resize, then re-fit. The 500 ms hold cap would not have fired (459 < 500) but the hold ends at the first channelLayout regardless.

### 3.6 Not measured
- Panel open/close (2.4), fit toggle with fit ON, matrix view round trip (2.7), add/remove channel (2.1 outside song load), format-mode editors, readonly worker. The code paths are the same message sequence as 3.3-3.5, but the spacing was not measured.
- Whether a blank frame is PRESENTED between `canvas.width` assignment (clears) and the next draw with `desynchronized: true`: code read only; no frame capture. `get_frame_stats` has no tracker-worker samples.
- Unexplained log entries before 3.4: the container went to 556x200 CSS px and back to 1256x645.5 about 3.8 s before the XM `patterns` message (two resize pairs plus two channelLayout posts). The window had been resized to 1100x800 by the browser tool earlier; cause of the shrink and the later growth not identified (focus change, overlay, or the tool restoring the window). Worth re-measuring during the plan phase with the DevTools window-size overlay off.

## 4. Existing animation helpers (none shared, none tracker-layout specific)
- No shared tween / easing / spring module in `src` (grep for lerp, ease*, tween*, smoothstep, animate* function or const names).
- Inline cubic ease-out rAF loops, copy-pasted: `components/dj/DeckPatternDisplay.tsx:191-208` (300 ms momentum decay, `1-(1-t)^3`), `components/dj/DeckAudioWaveform.tsx:303`, `components/dj/DeckTurntable.tsx:194`.
- Easing math: `types/automation.ts:266, 276, 290`, `components/automation/AutomationCurveEditor.tsx:451-468` (quad in-out), `engine/drumpad/DjFxActions.ts:850`, `lib/dub/personaBehaviour.ts:210` (private lerp), G:198 `lerpWhiteRGBA` (colour, private).
- Smooth scroll for playback is clock-driven, not eased: main thread computes `smoothOffset = progress * rowHeight` (P:2262, 2282, 2596, 2680-2728; scratch branch P:2712) and posts it in `playback` (P:2756); worker applies `baseY -= smoothOffset / scale` (G:490, W:254). Gate `getEffectiveSmoothScrolling()` (`stores/effectiveSmoothScrolling.ts:9-11`) = setting OR scratch active.
- Horizontal scroll (`scroll {x}`, W:135) and cursor (W:140) are set directly; no easing.
- `prefers-reduced-motion`: only `src/App.css:30` (Vite template logo spin). No JS check anywhere; `smoothScrolling` is a user setting not tied to the media query.
- Auto-scroll rAF during drag select: P:933-976 (main thread DOM scroll).

## 5. Unconfirmed (collected)
- Blank frame presentation between clear and redraw (3.6).
- channelLayout + scale always landing before the same worker rAF (code order only; measured 1.1 ms apart in 3.1, which makes a frame between them unlikely but possible).
- DPR change listener outside the tracker files.
- `ResponsivePanel.tsx` width animation.
- Which format editors drive `PatternEditorCanvas` in format mode from an in-view order matrix.
- The element whose width changes on song load (3.4 +5 px, 3.5 -124 px) and the source of the second `patterns` post.
- `buildGlyphAtlas` cost per scale change (`glyph-atlas.ts` not read beyond the signature).
- Mobile canvas path differences.
- P effect-cleanup line numbers (~2133-2150) approximate.

## 6. What this means for a plan (owner asked for this)
Documentary findings that bound the design; no decisions taken here:

1. The visible breakage is not one blank frame, it is **a sequence of partially-updated frames**: layout data arrives in up to nine messages over 200-460 ms per song load (3.4, 3.5), and the only guard (LayoutHold) covers the first 248 ms of the worst case and then releases while layout is still moving. A transition cannot interpolate towards a target that is not yet known, so a plan needs a settle point: either batch the main-thread posts into one `layout` message per commit, or hold until the sequence is quiet, before any animation makes sense.
2. Everything the owner listed converges on three worker-side quantities: canvas `w, h` (resize), `scale`, and `channelLayout.widths/offsets`. One interpolation path in the worker (W:262-279 `scaledLayout` / `scaledUi` is where instant values are applied) covers every trigger; the main thread would not need per-trigger code.
3. `renderer.resize` clears the canvas and rebuilds the atlas on every scale value. An animated scale that drives `renderer.resize` per frame would rebuild the atlas per frame (G:393-395) and reallocate the backing store per frame; a plan must animate in the projection (draw-time scale), not through `resize`.
4. Playback forces a redraw every rAF (W:232) and the `playback` message carries `smoothOffset` on the latency-sensitive path (P:2756). Any animation must be a worker-local tween driven by the existing rAF loop, adding no main-thread messages and no work when idle (knob perf invariant, `docs/CONTROL_PATTERNS.md`).
5. No reduced-motion handling exists; `App.css:30` is the only reference. A plan needs a media-query read on the main thread posted once in `uiState` or `init`.
6. The matrix round trip (2.7) unmounts the worker; nothing can animate across it without keeping the worker alive or snapshotting the last frame. Song load does not open the matrix; that part of the owner's symptom is user-driven view switching plus the sidebar width change on return.
7. Decisions for the owner (plan phase): which of the seven triggers animate; duration; whether song load animates at all (a new song has no visual continuity with the old one, so the choice there is between hold-until-settled and a crossfade, not a width tween).
