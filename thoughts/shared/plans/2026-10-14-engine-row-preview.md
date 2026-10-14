---
date: 2026-10-14
topic: Engine-rendered row preview - Enter on a whole-song-engine song sounds that row as playback renders it, by the engine itself
tags: [keyboard, row-preview, playback, engines, nuade, uade, eagleplayer, worker]
status: draft  # wave 0 + 1 implemented 2026-10-14; wave 2: U0-U3 done, U4 open (2 corpus rows)
---

# Engine-rendered row preview

Owner decision 2026-10-14 (thoughts/spot/todos.md ROW-PREVIEW-ENGINE-RENDER): BUILD. Enter (row preview) on a song
played by a whole-song engine sounds exactly that row as playback would, rendered by the engine itself; nuade first,
then every whole-song engine.

Why: the instrument path (`previewCell`, src/engine/keyboard/commands/playRow.ts, bfaf81b7d) only sounds notes whose
instrument has a sample/synth on our side. On nuade songs that is wallybeben 202/786 notes, scottjohnston 36/528,
fashiontracker and tomytracker 0; 29 of 46 nuade rows unmeasured.

Supersedes items R2, R3, R4 and R6 of thoughts/shared/plans/2026-10-06-row-preview.md (engine part). R5 (key bindings in
all six schemes) and R7 stay in that plan.

## Done means

- Enter / play_row / play_line / play_row_and_advance / play_note_on_line on a STOPPED song whose playing engine
  (`playingEngineFor`, src/engine/replayer/NativeEngineRouting.ts:115) is a whole-song engine sounds the row under the
  cursor rendered by that engine: the output samples equal playback's samples for that row (bit-exact up to the 5 ms
  end fade, D3), muted channels stay silent and dark, each sounding channel's meter and scope move.
- Every one of the 70 whole-song synth types (65 `WASM_ENGINES` descriptors + UADESynth, SunVoxSynth, SunVoxModular,
  SymphonieSynth, C64SID; counted from the `WHOLE_SONG_SYNTH_TYPES` literal and the registry `key:` entries, not from a
  feature grep) is either built (an item below ticked with commit) or carries a written exemption in the scope table.
- One reachability test (RP-R) through the real Enter key handler; unit tests where each piece lives; all in `test:ci`.
- `npm run type-check` clean. Only the affected tests run (no full sweeps, global 6a).

## Measured before planning (2026-10-14, headless, Node 24, Nuade.wasm as shipped)

Probe: open song in NuadeHeadless at 48 kHz, render linearly in 128-frame quanta for 180-240 s recording every tick
start frame from `nw_snapshot` (exact: all 121 nuade players are tick players, `render_raw` is used by none, so every
snapshot is stamped at its tick's first frame); then for rows at 10 %, 50 %, 90 %: `nw_start` + `nw_seek(F)` (cold) and
render the row, compare with the linear render. Also a block-aligned variant (seek to F rounded down to 128, then
render in 128 blocks). Machine load average was ~190 during the run (other agents), so the ms figures are upper bounds;
the worklet's own estimate is ~1 ms per second of song (Nuade.worklet.js swap comment).

| Song (player, followBy) | Row frames @48k (ms) | Frames/tick | Cold seek to row at ~10 % / 50 % / 90 % | Row from cold seek vs playback |
|---|---|---|---|---|
| wicked.wb (wallybeben, tick) | 5760 (120) | 960 | 34.9 / 253.9 / 409 ms (24 / 120 / 216 s) | max diff 0 (both variants) |
| ivory tover ii.ex (fashiontracker, orderRow) | 5760 (120) | 5850* | 25.1 / 164.8 / 305 ms (24 / 120 / 216 s) | 0 |
| sjs.menace (scottjohnston, tick) | 4420 (92.1) | 737 | 25.0 / 143.0 / 221.6 ms (18 / 90 / 162 s) | 0 |
| inconvenient intro.sg (tomytracker, tick) | 3840 (80) | 3840* | 34.6 / 212.8 / 382.2 ms | 0 |
| antidust.bp3 (soundmon, orderRow) | 5760 (120) | 5760* | 24.3 / 141.1 / 420.8 ms | 0 |
| les granges brulees.okta (oktalyzer, orderRow) | 4844 (100.9) | 969 | 55.3 / 288.0 / 456.2 ms | 0 |
| anthrox.fc (futurecomposer, orderRow) | 3840 (80) | 3841 | 27.3 / 124.2 / 237.0 ms | 0 |
| asperity megademo 3.dm2 (deltamusic2, orderRow) | 5760 (120) | 5760* | 28.9 / 231.7 / 455.4 ms | 0 |

\* the player reports tick 0 only (one snapshot per row), so frames/tick = frames/row.

Conclusions that fix the design:
1. A row rendered from a cold seek IS playback's row, sample for sample, regardless of render block alignment, on all
   8 songs. No state save/restore is needed for exactness; determinism is.
2. Seek cost is linear in the song position: 1.4-2.8 ms per second of song (upper bound). A cold jump to a row 3 min in
   costs 250-500 ms of CPU. That is too much for the audio thread (the swap path budgets slices there) and is the
   latency the owner would feel on a far jump; stepping forward one row costs one row of rendering (~0.2-0.4 ms).
3. Rows are 80-120 ms (3840-5760 frames at 48 kHz) on these songs; a clip is small (5760 frames x (2 + 4 voices)
   floats = 138 KB).

## Abstraction chosen: a private player instance in a row-preview worker, playing clips through the engine's output path

The domain invariant: "the row the user hears on Enter is the samples the engine produces for that row during
playback". The playing instance must stay untouched (it is stopped and rewound; the edit-swap path and the next Play
depend on it). So the row is rendered by a SECOND instance of the same player, in a Web Worker, and the result (a row
clip: stereo + per-voice buffers + pans per 128-frame chunk) is played by the engine's worklet through the same output
code that playback uses (main mix, channel isolation outputs and dub sends, scope stream, meter levels).

Three pieces, one per level:
- **Where a grid row is in the player's terms** (mapping): the inverse of the playhead follow, in the ONE place the
  follow lives (`GridFollow`, src/engine/replayer/tickGridFollow.ts). Row target = `{ kind: 'orderRow', order, row }`
  or `{ kind: 'ticks', from, to }`.
- **Rendering a row from a forward-only player** (algorithm, pure TS, engine-agnostic): `RowPreviewStream`. It keeps
  the preview instance as a stream from the subsong start, with a timeline (first frame of every row key it has
  rendered past) and a retained tail (the last rendered chunk not yet played). A request is served from the tail, by
  rendering forward, or by restart + silent advance to the exact frame the timeline already knows. Engine specifics sit
  behind a `RowRenderAdapter` (open / restart / advanceSilent / renderChunk / positionAt).
- **Playing a clip** (presentation): `public/worklets/row-clip.js` (`DevilboxRowClip`), a shared worklet helper like
  channel-outputs.js / channel-stream.js, and a refactor of each engine worklet's output code into one `emit()` that
  both playback and the clip call.

Plus a cursor prefetch (RP-6): while stopped, the worker walks the stream toward the row under the cursor in the
background, so Enter after a cursor jump plays at once instead of waiting 250-500 ms.

### Alternatives rejected

- **Seek the playing instance (and rewind after).** The 2026-10-06 WIP did this (branch
  backup-2026-10-06-row-preview-wip, e3b3dd2fa): every song then started at row 20 and patterns froze. Nuade's `stop`
  rewinds the main slot and the edit swap catches a next slot up to the main slot's frame; moving that frame for a
  preview breaks both. It also puts a 250-500 ms seek on the audio thread.
- **Third song slot inside the engine worklet (nw_preview_* in nuade-wasm/src/nuade_wasm.c).** Exact and needs no
  worker, but the seek runs on the audio render thread, which every engine and the DJ decks share: it has to be sliced
  (the swap path's way), so a 3-minute jump takes ~1.8x its CPU in wall time and still eats render headroom; and each of
  the 64 other engines would need the same in-worklet second instance. The worker keeps the audio thread free, needs no
  nuade-wasm change (the worker's own module instance IS the preview slot, `NuadeDriver`), and its adapters are plain TS
  that tests drive directly.
- **Offline whole-song render cache (render once, Enter plays a slice).** ~200 MB per 3-minute song with per-voice
  buffers, thrown away by every edit, and only 5 engines can render offline today (src/workers/dj-render.worker.ts:
  UADE, Hively, SID, libopenmpt, nuade).
- **State snapshot per row.** nuade has no state save/restore (third-party/nuade/include/nuade/nuade.h: seek is
  restart + silent render); neither do the C replayers.

## Decisions (no open questions)

- **D1 Stopped only.** While the transport plays, Enter on a whole-song-engine song renders nothing (playback is
  already sounding the grid; a second render would double the voices). TS-replayer songs keep the instrument path in
  both states.
- **D2 What "the row" is.** From the first frame the player stands at that row to the first frame it leaves it, at its
  FIRST occurrence in the current subsong played from its start (the frame the playhead follow would show). orderRow:
  `(order, row)` from the snapshot; ticks: `row * speed + tick` from the snapshot in `[from, to)` (the same quantity
  NuadeEngine.ts:159 feeds `followTicks`). A row the player never reaches before it loops or ends (pattern break,
  unplayed order) sounds nothing and the status bar says "Row is not played by the song" (status message, not a
  toast).
- **D3 End fade.** The clip's last 5 ms (round(0.005 * sampleRate) frames) fade linearly to 0 to avoid a click;
  every sample before the fade is bit-exact. A clip that replaces a sounding clip (D5) fades the old one over the same
  5 ms.
- **D4 Mute/solo.** The mask applied is the one the mixer last gave the engine (`setMuteMask`, bit N set = audible),
  read from the engine instance; the clip is rendered with it, and meters/scopes/isolation follow the same rules as
  playback (muted voice: out of the mix, meter 0, scope flat, no isolation output, no dub send).
- **D5 Repeat presses.** Latest wins: a new request cancels a pending one in the worker and replaces a sounding clip.
- **D6 Engines without a built adapter** keep the instrument path until their wave lands; exempt engines keep it
  permanently (exemption written in the scope table).
- **D7 Clip cap.** A row longer than 10 s is cut at 10 s (with the D3 fade).
- **D8 Edits.** Every request carries the module bytes playback would load (`editedModuleForPlay(song, desc) ??
  song[desc.fileDataKey]`, NativeEngineRouting.ts:347) and the load args; the worker compares them byte for byte with
  its open copy and reopens (timeline dropped) when they differ. No version tokens to keep in sync.
- **D9 Subsong.** The engine's current subsong (the one Play would start).
- **D10 Output gate.** stopNativeEngines sets the engine's output gain to 0 (NativeEngineRouting.ts:925) and tears
  down direct routing. A preview opens the gate and routes the engine exactly as startNativeEngines does, through
  helpers extracted from it (RP-2), and leaves them open (the next stop closes them as today).
- **D11 Worker lifetime.** One row-preview worker for the app, created on the first preview, holding one stream per
  engine key; a song load (new bytes) replaces that engine's stream. WASM in the worker loads on first use.
- **D13 Minimum clip length (owner, 2026-10-14).** A clip is at least `MIN_ROW_PREVIEW_MS` = 250 ms (`rowClip.ts`, `rowClipMinFrames`), decided once in `RowPreviewStream.request`: a shorter row plays on past its end with the exact playback audio (max diff 0), a longer row keeps its own length (D7 cap still wins), a song that ends sooner ends the clip there. The D3 5 ms fade stays at the clip end. Repeat presses are unchanged (D5): `row-clip.js` fades the sounding clip over 5 ms and holds one pending clip, so presses never pile up. Reason: on tick-grid songs (148 of 187) a row is one 20 ms player tick, a click. Supersedes the 'left as it is' FINDING below.
- **D12 Prefetch.** While stopped and the pattern editor is the active view, a cursor move (debounced 150 ms) asks
  the worker to prepare that row's clip; Enter on a prepared row plays it without a round trip to the player. A
  prepared clip is dropped on any request for another row, on an edit (D8) and on mute changes (D4).

## Checklist

IDs: RP = shared, N = nuade (wave 1), U = UADE family (wave 2), W3-xx / W4-xx = engines (waves 3, 4). Tick with the
commit hash. Ledger: this file.

### Wave 0 + 1 (shared pieces, proven by nuade)

- [x] **RP-1 Row target mapping.** `src/lib/tracker/tickGridPosition.ts`: add `gridRowStartTick(grid, songPos, row)`
  (inverse of `tickGridPosition` inside the first pass; take it from e3b3dd2fa, which has it with
  `playerGridRowStartTick`). `src/engine/replayer/tickGridFollow.ts`: `GridFollow.targetOf(songPos, row, followBy):
  RowTarget` - `'orderRow'` returns `{ kind: 'orderRow', order: songPos, row }`, `'tick'` returns
  `{ kind: 'ticks', from: gridRowStartTick(grid, songPos, row), to: from + grid.speed }`. Export `RowTarget` from a new
  leaf `src/engine/rowPreview/rowTarget.ts`.
  Automated: `src/lib/tracker/__tests__/gridRowStartTickInvertsTheFollow.test.ts` - for every row of a 3-position grid
  with mixed pattern lengths and firstTick 0/5, `tickGridPosition(gridRowStartTick(g, p, r), g)` returns `(p, r)`;
  `targetOf` gives the documented shapes. Added to `test:ci`.

- [x] **RP-2 One load path, one routing path.** Extract from `startNativeEngines` (NativeEngineRouting.ts:290-420):
  `engineLoadArgs(song, desc, isDJDeck): Promise<{ data: ArrayBuffer; args: unknown[] }>` (lines 347-353) and
  `openEngineOutput(desc, instance, separationInputTone)` (the gain restore at :381 plus the direct-routing block). The
  play path calls them; no behaviour change.
  Automated: existing play tests touching startNativeEngines (`src/engine/__tests__/nativeEnginesMixerMask.test.ts`,
  `src/engine/nuade/__tests__/nuadeEngine.test.ts`) still pass; new
  `src/engine/replayer/__tests__/engineLoadArgsAreWhatPlayLoads.test.ts` asserts the bytes and args equal what
  `loadTune` received in a play of the same song (edited grid included).

- [x] **RP-3 Row render algorithm.** `src/engine/rowPreview/rowPreviewStream.ts` (pure, no DOM/worker imports):
  `interface RowRenderAdapter { open(data, args): OpenResult; restart(): void; advanceSilent(toFrame): number;
  renderChunk(frames, mask): Chunk /* stereo, voices|null, pans|null, frames, flags (looped/ended) */;
  positionAt(frame): PlayerPosition | null /* order,row,tick,speed */; }` and `class RowPreviewStream` with
  `request(target: RowTarget, mask): RowClip | RowMissed`: timeline Map(rowKey -> first frame), retained tail, serve
  order tail -> forward (render chunks, find the exact start frame by binary search of `positionAt` inside the chunk,
  as the probe did) -> restart + `advanceSilent(F)` when the timeline holds F behind the tail; stops at the first frame
  of another key (D2), applies D3 fade and D7 cap; `RowMissed` on loop/end flag before the target. Byte compare for D8.
  Automated: `src/engine/rowPreview/__tests__/rowPreviewStream.test.ts` with a scripted fake adapter (deterministic
  counter player): tail serve, forward, restart path (call counts of restart/advanceSilent asserted), missed row,
  ticks target spanning rows, fade length = round(0.005 * rate), cap, reopen on changed bytes. Added to `test:ci`.

- [x] **RP-4 Row-preview worker + client.** `src/workers/rowPreview.worker.ts` (thin glue) over
  `src/engine/rowPreview/rowPreviewHost.ts` (`createRowPreviewHost(loaders)`: one `RowPreviewStream` per engine key,
  latest-wins cancellation per D5, prefetch cache per D12); `src/engine/rowPreview/rowPreviewClient.ts` (one worker,
  request ids, transferable clip buffers; tests construct it over the host in-process). Adapter registry
  `src/engine/rowPreview/adapters/index.ts` keyed by `WASM_ENGINES` key.
  Automated: `src/engine/rowPreview/__tests__/rowPreviewHost.test.ts` - second request cancels the first (first resolves
  'cancelled'), prefetch hit returns without calling the adapter again (call count), changed bytes reopen.

- [x] **RP-5 Entry point.** `src/engine/keyboard/commands/playRow.ts`: `playRow()` asks
  `getTrackerReplayer().previewRow(currentPositionIndex, cursor.rowIndex)` (stores: `useTrackerStore`
  `currentPositionIndex`, `useCursorStore` `cursor.rowIndex`) when `playingEngineFromStores(...)` is not `'tracker'`;
  that returns `'engine' | 'playing' | 'unsupported'`; `'unsupported'` falls through to today's instrument path (D6),
  `'playing'` returns 0 (D1). `TrackerReplayer.previewRow` delegates to `previewNativeRow(song, songPos, row,
  separationInputTone, routedNativeEngines)` in NativeEngineRouting.ts: resolves the descriptor with the router's rule
  (`shouldActivate`, same as `playingEngineFor`), the instance, `isRowClipPlayer(instance)` and an adapter for the key;
  builds the request from `engineLoadArgs` (RP-2), the instance's `targetOf` (RP-1) and its current mute mask (D4);
  calls `openEngineOutput` (D10) and `instance.playRowClip(clip)`; posts the D2 status message on `RowMissed`. All five
  keyboard commands already route through `playRow` (useGlobalKeyboardHandler.ts:193, 653, 654, 841;
  useTrackerInput.ts:1426), so nothing else changes.
  Automated: `src/engine/keyboard/__tests__/playRowPicksTheEnginePath.test.ts` - engine song stopped -> previewRow
  called, `previewCell` not called; engine song playing -> neither; tracker song -> previewCell; unsupported engine ->
  previewCell.

- [x] **RP-6 Cursor prefetch (D12).** `src/engine/rowPreview/rowPreviewPrefetch.ts`: subscribes to `useCursorStore`
  row / `useTrackerStore` position while `useTransportStore.isPlaying` is false and the song is engine-played;
  debounced 150 ms; calls the client's `prepare(...)`. Mounted once where the pattern editor mounts its other
  engine-follow subscriptions (the implementer names the file in the commit after reading the mount; no new
  component).
  Automated: `src/engine/rowPreview/__tests__/prefetchFollowsTheCursorWhileStopped.test.ts` - fake timers: three
  cursor moves within 150 ms -> one prepare for the last row; while playing -> none.

- [x] **RP-7 Clip player in the worklet.** `public/worklets/row-clip.js` (`globalThis.DevilboxRowClip`): queue a clip,
  hand one quantum per `process()` (stereo, voices, pans), 5 ms crossfade-out on replace (D3/D5), post
  `{ type: 'rowClipStarted', frames }` / `{ type: 'rowClipDone' }`. Load it where `channel-outputs.js` and
  `channel-stream.js` are loaded (src/engine/wasm/WASMSingletonBase.ts:120-127) and in the test harness
  (`loadSharedWorkletScripts`, src/engine/__tests__/workletHarness.ts:25).
  Automated: `src/engine/__tests__/rowClipHelper.test.ts` - a 1000-frame clip comes out as 8 quanta, last 240 frames at
  48k faded, replace mid-clip fades the old one over 240 frames then starts the new one.

- [x] **N1 Nuade adapter.** `src/engine/rowPreview/adapters/nuadeAdapter.ts` over `NuadeDriver`
  (src/engine/nuade/nuadeDriver.ts) loaded with `loadNuadeModuleFromPublic` (nuadeModule.ts:87) in the worker,
  `NuadeHeadless` in Node: `open` = clearFiles + addFile(companions) + open(bytes, fileName, playerId) + start(subsong);
  `restart` = start(subsong); `advanceSilent` = seek; `renderChunk` = setMuteMask + render(n, true) + pans();
  `positionAt` = snapshot(frame). No nuade-wasm change.
  Automated: `src/engine/rowPreview/__tests__/nuadeRowClipEqualsPlayback.test.ts` - wicked.wb and
  `ivory tover ii.ex`: rows at 10 % / 50 % via the stream (cold) equal the linear NuadeHeadless render at the same
  frames, max diff 0 before the fade; a muted voice is absent (equals the linear render with the same mask).

- [x] **N2 Nuade worklet plays clips.** `public/nuade/Nuade.worklet.js`: move the output code of `process()` (lines
  ~399-424: copy to outL/outR, `o.write` with pans, `_stream.writeFloat32` with the scope mask, VU) into
  `emit(outputs, stereo, voices, pans, n)`; playback calls it with the main slot's buffers, the clip path with
  `DevilboxRowClip`'s quantum when not playing. Clip meter levels: per-voice peak of the clip quantum, masked exactly
  as `postVu` masks (one helper `maskedLevels(levels)` used by both). `'play'`, `'loadModule'`, `'setSubsong'`,
  `'dispose'` drop a sounding clip.
  Automated: extend `src/engine/nuade/__tests__/nuadeWorklet.test.ts`: a posted clip comes out of output 0
  sample-exact, a muted voice's scope stream is flat and its level 0, `play` drops the clip.

- [x] **N3 NuadeEngine implements the clip player and target.** `src/engine/nuade/NuadeEngine.ts`:
  `playRowClip(clip)` (posts `{ type: 'playRowClip', ... }` with transfer), `targetOf(songPos, row)` (its
  `GridFollow` + `followBy`; calls `setGrid(song)` first when the grid is unset because the song was never played),
  `muteMask` getter (the `_muteMask` it already stores). Protocol types in `src/engine/nuade/nuadeProtocol.ts`
  (`NuadeIn` / `NuadeOut`). `'vu'` from a clip reaches `meterFeed.report` like playback's.
  Automated: covered by RP-R plus a protocol case in `src/engine/nuade/__tests__/nuadeProtocol.test.ts`.

- [x] **N4 Corpus gate for nuade (landing reason: claim "every nuade row").** `tools/nuade/rowPreviewGate.ts`
  (`npm run nuade-row-preview`): for every nuade corpus song, rows at 10/50/90 % through the stream vs linear render;
  writes one verdict per song to `test-data/nuade-row-preview.json` as it completes, skips recorded songs,
  `--only <song>` and `--failed` re-run options (global 6a). Records cold-seek ms and row frames too (fills the
  per-player numbers this plan measured on 8 songs).
  Automated: the tool's verdict file has a row for every corpus song with max diff 0; any non-zero row is a bug item
  added here.

- [x] **RP-R The one reachability test.** `src/hooks/__tests__/enterSoundsTheRowThroughTheSongsEngine.test.tsx`:
  nuade rig (`installNuadeRig`, src/engine/nuade/__tests__/nuadeEngineRig.ts) + row-preview client over the host
  in-process + real `useTrackerInput` with the ProTracker scheme (as rowPreviewMovesTheMeterOfTheChannelItSounds.test.tsx
  sets it up). Load `public/data/songs/wally-beben/wicked.wb` (an instrument-path-silent song) stopped; cursor at
  position 3, row 8; mute channel 2; press Enter. Assert: (a) sentinel - `NuadeEngine.playRowClip` called once and the
  worklet posted `rowClipStarted`; `previewCell` call count 0; (b) the rig's output for the clip equals NuadeHeadless's
  linear render of that row with the same mask, max diff 0 before the fade, and its peak > 0.01; (c) the channel meter
  sink's `triggerChannelMeter` fired for every unmuted channel with a note in that row and never for channel 2;
  (d) channel 2's scope samples are all 0; (e) the cursor moved down by the edit step. Added to `test:ci`.

- [x] **N5 Type-check + affected tests.** `npm run type-check` clean; run only the tests named in RP-1..RP-7, N1..N3,
  RP-R.

### Wave 2 - UADE family

- [x] **U0 Measure first.** In Node: UADE.wasm second instance memory (heap size after load) and silent-advance cost
  per second of song for 3 corpus songs (UADEEditable), 2 EaglePlayer songs; determinism check as in this plan's
  probe (cold-advance row vs linear). Record the table here. A non-deterministic engine is a bug to fix in the engine,
  not a reason to drop the row.
- [x] **U1 UADEEditable adapter** (`adapters/uadeAdapter.ts`): load path of dj-render.worker.ts `initUADE`/`loadUADE`
  (reuse: extract the loader into a shared module both workers import; do not copy it). Position: the player tick count
  (`uade_wasm_get_player_tick_count`) mapped with `playerGridRowStartTick` (e3b3dd2fa) when `uadePlayerTickGrid`, CIA
  ticks with `uadeFirstTick` otherwise (rowSeek.ts on e3b3dd2fa). Exact row start: render in tick-sized chunks, or
  add a frames-to-next-tick export to the UADE glue if the probe in U0 shows per-chunk positions only.
  `UADEEngine.playRowClip` + `UADE.worklet.js` emit refactor + row-clip.js.
- [x] **U2 UADE classic (UADESynth, opaque).** Its grid follows a fixed frames-per-row estimate (e3b3dd2fa
  rowSeek.ts reason); the row IS that frame range, so target = `{ frames: [r * fpr, (r + 1) * fpr) }` (add the third
  `RowTarget` kind here, not earlier). Same adapter as U1.
- [x] **U3 EaglePlayer** (Musashi runner): adapter over its WASM (EaglePlayer.worklet.js load path), position = player
  ticks via `eaglePlayerGrid` (e3b3dd2fa); `EaglePlayerEngine.playRowClip`; worklet emit refactor.
- [ ] **U4 Per-engine row-clip-equals-playback test** for U1-U3 (one test file per engine, corpus songs), in `test:ci`.

### Wave 3 - dedicated replayers that post a position (28)

Each item: worker adapter over the engine's WASM factory (loaded as dj-render.worker.ts loads UADE: fetch + factory,
shared loader from U1), position from the same export its worklet reads for its `'position'` message, exact row
start (frames-to-next-tick export in the engine's C glue where the export is missing - we build these WASMs), worklet
`emit()` refactor + row-clip.js, `<Engine>.playRowClip` + `targetOf`, and one row-clip-equals-playback test on a corpus
song (or a written exemption here when the repo has no song: then the test uses the engine's own test song as
nativeEnginesMixerMask.test.ts does for SteveTurner). IDs:

W3-01 ActionamicsReplayer, W3-02 ActivisionProReplayer, W3-03 BenDaglish, W3-04 Cinter4, W3-05 DeltaMusic1Replayer,
W3-06 DigMugReplayer, W3-07 DssReplayer, W3-08 FredReplayer2, W3-09 FutureComposerReplayer, W3-10 FuturePlayer,
W3-11 HippelSt, W3-12 Hively, W3-13 InStereo1Replayer, W3-14 InStereo2Replayer, W3-15 JamCracker, W3-16 Klystrack,
W3-17 MusicAssembler, W3-18 MusicLine, W3-19 PreTracker, W3-20 SidMon1Replayer, W3-21 SidMon2, W3-22 SonicArranger,
W3-23 Sonix, W3-24 SoundFactory2Replayer, W3-25 SoundMonReplayer, W3-26 StoneTracker, W3-27 SynthesisReplayer,
W3-28 TFM.

### Wave 4 - engines with no `'position'` post found (34 registry + 4 outside it)

- [ ] **W4-0 Audit.** For each engine below: how its grid follows playback (if at all) - read the engine class's
  position path, not a grep - and whether the song has grid rows the player's clock maps to. Outcome per engine, written
  into the scope table: (a) a position source exists (other message name, timing table such as TFMX
  `tfmxTimingTable`, NativeEngineRouting.ts ~420) -> build like wave 3; (b) no grid row maps to a player position
  (song-only formats: VGM/SNDH/NSF-style players) -> exemption with the reason; the instrument path stays (D6).
- Items W4-01..W4-38 (one per engine, built or exempted per W4-0): ArtOfNoise, Asap, Aylet, Cpsycle,
  DavidWhittakerReplayer, DeltaMusic2Replayer, Eupmini, FaceTheMusicReplayer, Fmplayer, Gme, Hippel, Ixalance,
  MaxTrax, Mdxmini, MusicMaker, OktalyzerReplayer, Organya, PiyoPiyo, Pmdmini, Psgplay, PumaTracker, Pxtone, Qsf,
  QuadraComposerReplayer, RonKlarenReplayer, S98, Sawteeth, Sc68, SoundControlReplayer, SteveTurner, SunTronicSong,
  TFMXModule, V2M, Zxtune (W4-01..W4-34, registry order above), SunVoxSynth + SunVoxModular (W4-35), SymphonieSynth
  (W4-36), C64SID (W4-37), and W4-38 the scope table's final state checked against `WHOLE_SONG_SYNTH_TYPES` by a test
  (`src/engine/rowPreview/__tests__/everyWholeSongEngineIsBuiltOrExempt.test.ts`: every type in the set maps to an
  adapter key or an exemption entry in `src/engine/rowPreview/adapters/index.ts`).

Several wave-4 formats (DeltaMusic2, FaceTheMusic, Oktalyzer, QuadraComposer, RonKlaren, PumaTracker, ...) are nuade
dual rows: with the nuade engine selected they get row preview from wave 1 already.

### Manual (owner) - collected, never ticked by an agent

- [ ] **M1 Wave 1 listening check.** LOCAL `http://localhost:5174`, `npm run dev`. Load
  `public/data/songs/wally-beben/wicked.wb` (stopped), pattern editor, ProTracker keymap. Put the cursor on a row with
  notes, press Enter repeatedly. PASS: each press sounds the row as it sounds during playback (same instruments, no
  silence), the channel meters and scopes flash for the sounding channels, a muted channel stays dark and silent, the
  cursor steps down. FAIL as reported: silence on rows whose notes have no instrument of ours. Then jump the cursor to
  the last pattern, wait a moment, press Enter: it should sound at once (prefetch). Repeat with
  `public/data/songs/fashion-tracker/ivory tover ii.ex`.
- [ ] **M2 Per wave** the same check on one song of each built engine (listed in the wave's commit).

## Per-engine scope table

Position column = the engine's worklet posts `type: 'position'` (grep of that spelling over the worklet the engine
class loads, 2026-10-14; 0 means not found by that spelling, NOT proven absent - W4-0 decides). Seek column = the
worklet mentions seek/set-position (same grep). Neither column is needed by the chosen design (the worker runs a fresh
instance forward); they tell how much each adapter must add.

| Engine key | Worklet | Position | Seek | Wave / item | Mechanism |
|---|---|---|---|---|---|
| Nuade | Nuade.worklet.js | yes | yes (frame) | 1 / N1-N4 | NuadeDriver in worker, tick-stamped snapshots, exact |
| UADEEditable | UADE.worklet.js | yes | yes | 2 / U1 | player or CIA ticks |
| UADESynth (UADE classic) | UADE.worklet.js | - | - | 2 / U2 | frames-per-row estimate the grid already uses |
| EaglePlayer | EaglePlayer.worklet.js | yes | no | 2 / U3 | player ticks |
| ActionamicsReplayer | Actionamics.worklet.js | yes | no | 3 / W3-01 | worker instance |
| ActivisionProReplayer | ActivisionPro.worklet.js | yes | no | 3 / W3-02 | worker instance |
| BenDaglish | Bd.worklet.js | yes | no | 3 / W3-03 | worker instance |
| Cinter4 | Cinter4.worklet.js | yes | yes | 3 / W3-04 | worker instance |
| DeltaMusic1Replayer | DeltaMusic1.worklet.js | yes | no | 3 / W3-05 | worker instance |
| DigMugReplayer | DigMug.worklet.js | yes | no | 3 / W3-06 | worker instance |
| DssReplayer | Dss.worklet.js | yes | no | 3 / W3-07 | worker instance |
| FredReplayer2 | FredReplayer.worklet.js | yes | no | 3 / W3-08 | worker instance |
| FutureComposerReplayer | FutureComposer.worklet.js | yes | no | 3 / W3-09 | worker instance |
| FuturePlayer | FuturePlayer.worklet.js | yes | no | 3 / W3-10 | worker instance |
| HippelSt | HippelST.worklet.js | yes | no | 3 / W3-11 | worker instance |
| Hively | Hively.worklet.js | yes | no | 3 / W3-12 | worker instance (dj-render.worker already renders Hively offline) |
| InStereo1Replayer | InStereo1.worklet.js | yes | no | 3 / W3-13 | worker instance |
| InStereo2Replayer | InStereo2.worklet.js | yes | no | 3 / W3-14 | worker instance |
| JamCracker | JamCracker.worklet.js | yes | no | 3 / W3-15 | worker instance |
| Klystrack | Klystrack.worklet.js | yes | no | 3 / W3-16 | worker instance |
| MusicAssembler | Ma.worklet.js | yes | no | 3 / W3-17 | worker instance |
| MusicLine | MusicLine.worklet.js | yes | no | 3 / W3-18 | worker instance |
| PreTracker | PreTracker.worklet.js | yes | yes | 3 / W3-19 | worker instance |
| SidMon1Replayer | SidMon1Replayer.worklet.js | yes | no | 3 / W3-20 | worker instance |
| SidMon2 | Sd2.worklet.js | yes | no | 3 / W3-21 | worker instance |
| SonicArranger | SonicArranger.worklet.js | yes | no | 3 / W3-22 | worker instance |
| Sonix | Sonix.worklet.js | yes | no | 3 / W3-23 | worker instance |
| SoundFactory2Replayer | SoundFactory2.worklet.js | yes | no | 3 / W3-24 | worker instance |
| SoundMonReplayer | SoundMon.worklet.js | yes | no | 3 / W3-25 | worker instance |
| StoneTracker | StoneTracker.worklet.js | yes | no | 3 / W3-26 | worker instance |
| SynthesisReplayer | Synthesis.worklet.js | yes | no | 3 / W3-27 | worker instance |
| TFM | TFM.worklet.js | yes | no | 3 / W3-28 | worker instance |
| ArtOfNoise | ArtOfNoise.worklet.js | not found | no | 4 / W4-01 | W4-0 decides |
| Asap | Asap.worklet.js | not found | no | 4 / W4-02 | W4-0 decides |
| Aylet | Aylet.worklet.js | not found | no | 4 / W4-03 | W4-0 decides |
| Cpsycle | Cpsycle.worklet.js | not found | no | 4 / W4-04 | W4-0 decides |
| DavidWhittakerReplayer | DavidWhittaker.worklet.js | not found | no | 4 / W4-05 | W4-0 decides |
| DeltaMusic2Replayer | DeltaMusic2.worklet.js | not found | no | 4 / W4-06 | W4-0 decides (nuade dual row) |
| Eupmini | Eupmini.worklet.js | not found | no | 4 / W4-07 | W4-0 decides |
| FaceTheMusicReplayer | FaceTheMusic.worklet.js | not found | no | 4 / W4-08 | W4-0 decides (nuade dual row) |
| Fmplayer | Fmplayer.worklet.js | not found | no | 4 / W4-09 | W4-0 decides |
| Gme | Gme.worklet.js | not found | no | 4 / W4-10 | W4-0 decides |
| Hippel | (engine file names TFMX.worklet.js first - verify in W4-0) | not found | yes | 4 / W4-11 | W4-0 decides |
| Ixalance | Ixalance.worklet.js | not found | no | 4 / W4-12 | W4-0 decides |
| MaxTrax | Maxtrax.worklet.js | not found | no | 4 / W4-13 | W4-0 decides |
| Mdxmini | Mdxmini.worklet.js | not found | no | 4 / W4-14 | W4-0 decides |
| MusicMaker | MusicMaker.worklet.js | not found | no | 4 / W4-15 | W4-0 decides |
| OktalyzerReplayer | Oktalyzer.worklet.js | not found | no | 4 / W4-16 | W4-0 decides (nuade dual row) |
| Organya | Organya.worklet.js | not found | no | 4 / W4-17 | W4-0 decides |
| PiyoPiyo | PiyoPiyo.worklet.js | not found | no | 4 / W4-18 | W4-0 decides |
| Pmdmini | Pmdmini.worklet.js | not found | no | 4 / W4-19 | W4-0 decides |
| Psgplay | Psgplay.worklet.js | not found | no | 4 / W4-20 | W4-0 decides |
| PumaTracker | PumaTracker.worklet.js | not found | no | 4 / W4-21 | W4-0 decides (nuade dual row) |
| Pxtone | Pxtone.worklet.js | not found | no | 4 / W4-22 | W4-0 decides |
| Qsf | Qsf.worklet.js | not found | no | 4 / W4-23 | W4-0 decides |
| QuadraComposerReplayer | QuadraComposer.worklet.js | not found | no | 4 / W4-24 | W4-0 decides (nuade dual row) |
| RonKlarenReplayer | RonKlaren.worklet.js | not found | no | 4 / W4-25 | W4-0 decides |
| S98 | S98.worklet.js | not found | no | 4 / W4-26 | W4-0 decides |
| Sawteeth | Sawteeth.worklet.js | not found | no | 4 / W4-27 | W4-0 decides |
| Sc68 | Sc68.worklet.js | not found | no | 4 / W4-28 | W4-0 decides |
| SoundControlReplayer | SoundControl.worklet.js | not found | no | 4 / W4-29 | W4-0 decides |
| SteveTurner | SteveTurner.worklet.js | not found | no | 4 / W4-30 | W4-0 decides |
| SunTronicSong | SunTronicResampler.worklet.js | not found | no | 4 / W4-31 | W4-0 decides |
| TFMXModule | TFMX.worklet.js | not found | yes | 4 / W4-32 | timing table (tfmxTimingTable) likely - W4-0 |
| V2M | V2MPlayer.worklet.js | not found | yes | 4 / W4-33 | W4-0 decides |
| Zxtune | Zxtune.worklet.js | not found | no | 4 / W4-34 | W4-0 decides |
| SunVoxSynth, SunVoxModular | - | - | - | 4 / W4-35 | W4-0 decides |
| SymphonieSynth | SymphonieWasm.worklet.js | - | set_position | 4 / W4-36 | W4-0 decides |
| C64SID | - | - | - | 4 / W4-37 | W4-0 decides |

Not whole-song engines, out of scope (instrument path stays): TS-replayer songs, libopenmpt and Furnace-sequencer
songs (their instruments are ours).

## Risks and how the plan answers them

- **Cold-jump latency** (250-500 ms at 3 min, upper bound): off the audio thread (worker) and hidden by the cursor
  prefetch (RP-6); stepping forward costs one row (~0.2-0.4 ms).
- **Worker memory**: one extra player instance per previewed engine (nuade: one more module instance). U0 measures
  UADE's before wave 2 builds it.
- **Exactness of other engines**: not assumed. Each wave-2/3/4 item has its own row-clip-equals-playback test; a
  mismatch is fixed in that engine (determinism, chunk-size dependence), never masked.

## Ledger - wave 0 + 1 (13 items), started 2026-10-14

Running count: 13 of 13 (wave 0 + 1 done; wave 2-4 and M1/M2 open). Order: RP-1, RP-2, RP-7, RP-3, N1, RP-4, N2, N3, RP-5, RP-6, N4, RP-R, N5.

| ID | Done | Commit |
|---|---|---|
| RP-1 | yes | 12502120e |
| RP-2 | yes | e35f8b4d9 |
| RP-3 | yes | a59f9a19a |
| RP-4 | yes | fb7edc31c |
| RP-5 | yes | af888b496 |
| RP-6 | yes | 614391142 |
| RP-7 | yes | 5130e60f0 |
| N1 | yes | 901ce669c |
| N2 | yes | f4c6f5155 |
| N3 | yes | 64468848b |
| N4 | yes | c55502c59 |
| RP-R | yes | 973ffd29f |
| N5 | yes | c55502c59 (type-check + the named tests, no code) |
| RP-MIN (D13, 250 ms minimum clip; RP-R / N4 expectations now clip >= 250 ms) | yes | see git log: 'Row preview minimum clip' |

Decisions / deviations (append as found):

- **Fade lives in `row-clip.js`, once.** The stream does not bake the D3 fade: the clip carries `fadeFrames` (= round(0.005 * rate),
  at most the clip length) and `DevilboxRowClip` applies it to the mix and to every voice buffer. "Before the fade" in RP-R / N1 is
  `frames - fadeFrames`.
- **`targetOf(song, songPos, row)`** takes the song (always `setGrid(song)` first: the grid is the song as it is now, edits included).
- **The decision is one function, `rowPreviewRoute(format, instruments, transportPlaying)`** (NativeEngineRouting.ts), read by
  `TrackerReplayer.previewRow` (sync: `'engine' | 'playing' | 'unsupported'`) and by the prefetch. Supported keys:
  `src/engine/rowPreview/supportedEngines.ts`, held equal to `adapters/index.ts` by `rowPreviewHost.test.ts`.
- **Mixer mask.** The mixer only tells engines that already have an instance, so a mute made before the engine ever played never
  reached it. `previewNativeRow` hands the engine `mixerAudibleMask(channels, isSoloing)` (extracted from `forwardReplayerMuteMask`, one
  source) before it asks for the mask. `rowClipMask` = the engine's `_muteMask` without the isolation slots it posted
  (`WASMChannelOutputsEngine.isolatedMask`, tracked on `addIsolation` / `removeIsolation`, cleared when the node is replaced).
- **Scope stream.** A clip shorter than one 1024-sample scope chunk (every row of a per-tick grid) never reached the scopes:
  `DevilboxChannelStream.flush()` is new, the Nuade worklet flushes and `discontinue()`s when a clip ends.
- **Pans per clip are per 128-frame render chunk**, as rendered from the row's first frame, not aligned to playback's quantum grid. They
  only place a voice on the isolation slots and dub sends; the main mix comes from nuade and is exact.
- **A `looped` flag inside the row's last chunk** keeps up to 127 frames of the next loop in the clip (the render does not say where in
  the chunk it looped).
- **FINDING - the grid of a tick-followed song is a grid of player ticks.** wicked.wb parses to `initialSpeed` 1 and 45 patterns of 4-8
  rows: a grid row is ONE player tick (960 frames = 20 ms at 48 kHz), not the 120 ms row the probe table measured. Enter on such a
  row sounds the voices as they stand in that tick: 20 ms, a click-length sample of sustained voices (148 of the 187 openable nuade
  corpus songs are tick-followed; row frames over the gate: min 128, median 5759, max 480000 = the 10 s cap). Exactness holds
  (max diff 0). Whether a 20 ms row is what the owner wants to hear on these songs is a PRODUCT decision, not built: options are a
  minimum clip length (play on past the row), or the player's own musical row. Left as it is until the owner decides.
- **RP-R row.** The plan's "position 3, row 8" does not exist in that grid (patterns have 4-8 rows). The test finds, with a scratch
  stream, the first row from position 3 on where voice 2 (the muted one) and another voice both sound: position 31 row 5, 960 frames
  from song frame 492459, max diff 0, peak 0.083.
- **N1 / unit rows** sit at 8 s and 45 s (bounded linear renders), not 10 % / 50 %; the corpus gate (N4) uses 10 / 50 / 90 %.
- **Search cost.** Walking forward to an unseen row kept re-scanning the whole timeline for the target and its end each chunk (O(n^2));
  the scan now looks only at what a chunk added and finds the row end by bisection. Corpus gate, cold request time (the max of the
  three requests per song, the first being a forward walk to 90 %): median 220 ms, p90 927 ms, max 2092 ms on 5 min songs at machine
  load ~40; before the fix median 344, p90 2943, max 5704.
- **N4 result** (`npm run nuade-row-preview`, `test-data/nuade-row-preview.json`, gitignored): 211 corpus songs, 187 pass with max diff
  0 at 10 / 50 / 90 %, 0 fail, 0 missed, 24 `error` = `nuade open failed`: the song's companion files (smp.*, .ins, .AS, songplay, .info,
  Samples/) are not in the repo, so the same open fails in playback; they are not row-preview results.
- **test:ci** gained: gridRowStartTickInvertsTheFollow, engineLoadArgsAreWhatPlayLoads, src/engine/rowPreview/__tests__/ (whole
  directory), rowClipHelper, playRowPicksTheEnginePath, enterSoundsTheRowThroughTheSongsEngine. src/engine/nuade/__tests__/ was
  already there whole.
- **Prefetch** is mounted in `TrackerView` (`useEffect(() => startRowPreviewPrefetch(), [])`), no new component.
- **N5:** `npm run type-check` has one error, in another session's uncommitted WIP (`PatternEditorCanvas.tsx` 484, TS6133 `cwPx`);
  nothing of this work. 24 test files / 118 tests of the items named above pass.

## Ledger - wave 2 (UADE family, 5 items), 2026-10-14

Running count: 4 of 5 (U0, U1, U2, U3 done; **U4 open: 2 of 355 UADE corpus songs fail the gate**). Waves 3-4 and M1/M2 open.

| ID | Done | Commit |
|---|---|---|
| shared (frames target, mask while advancing, timeline rebuild, adapter prepare) | yes | 98722d296 |
| U3 EaglePlayer | yes | b7f28bd2c |
| UADE capture FIFO emptied on load (C fix, wasm rebuilt) | yes | be392ddcb |
| UADE clock + load args on the live song | yes | fe64737df |
| U1 UADEEditable | yes | 31ebddf95 |
| U2 UADE classic | yes | ca81996c8 |
| U0 measurements | yes | table below |
| U4 gates + tests | PARTIAL | tests: uadeRowClipEqualsPlayback, eaglePlayerRowClipEqualsPlayback, uadeFamilyEnginesPlayRowClips; gate `npm run uade-row-preview` |

**U0 (Node, 48 kHz).** UADE.wasm instance: 48 MiB (50331648 B) after init, unchanged by a load; EaglePlayer.wasm: 16 MiB. Silent run: UADE ~8-10 ms per song second (6 s in 48-61 ms, 3 songs: skateordie.rh, rackney'sisland 4.sm, crown arabia.hst), EaglePlayer 5-15 ms per second (wicked.wb, incredibleshrinkingsphere.dl). Determinism: render in 1, 16 and 128-frame calls, and after a reset + reload, max diff 0 (all 5 songs). Cold row request over the gates: UADE 2094 rows median 252 ms, p90 657, max 2993; EaglePlayer 10 songs median 246, max 1918.

**Gates.** `npm run uade-row-preview` (UADE, 355 PLAYS songs of test-data/uade-corpus-sweep.json, rows at 10/50/90 % of the first minute, named in frames and, where the interrupt count runs, in player ticks): 353 pass, **2 fail: eco.gray, warlock_the_avenger.sqt** (max diff 0.55 / 0.6 on rows after a restart). `-- --engine eagleplayer`: 10 of 10 pass. Verdicts in test-data/{uade,eagleplayer}-row-preview.json (gitignored); re-run one with `-- --only eco.gray`, the failures with `-- --failed`.

**U4 NEXT STEP.** Find why eco.gray and warlock_the_avenger.sqt differ between a fresh linear render and restart + silent advance (the 0.9 frames row, reached with no restart, is exact; the rows after a restart are not): try a fresh instance for each restart (adapter.newWasm) versus full_reset, and compare the two renders per frame to see where they part. The fix belongs in the engine or the adapter's restart, not in the gate.

Decisions / findings (wave 2):
- Frames target: the third RowTarget kind (U2). The opaque player's row is 5292 output frames (OPAQUE_UADE_FRAMES_PER_ROW, one constant with usePatternPlayback); a clockless editable song uses the scheduler's 2.5/bpm*speed; TFMX timing tables use the song's own 50 Hz jiffies.
- UADE mask = audible bits 0-3 | isolated bits 8-11 (uade_wasm_isolate_channels): the emulator renders ahead of what it hands out, so the mask goes in before the run (advanceSilent takes it).
- UADE capture FIFO (audio.c, 8192 frames) outlived a load: emptied in uade_wasm_load; advance steps are 256 frames because a big call overflows it.
- A UADE reset keeps state of the song before: a different song gets a clean instance (prepare), a restart of the same song resets in place.
- FOUND, fixed: the format store kept neither uadeFirstTick nor uadePlayerTickGrid, so the live song never carried them (playhead follow of interrupt-player songs fell to a CIA tick that stays 0).
- FOUND, not fixed: the TFMX playhead converts frames to jiffies with a fixed 882 frames (right at 44.1 kHz only); the opaque-UADE playback worklet and the worklet reload leave stale capture only if the wasm is older than be392ddcb.
- Type-check: clean for this work; the tree has an error in another session's src/components/dj/__tests__/djViewFitsEveryCommonResolution.test.tsx (TS6133 act, TS1294).
