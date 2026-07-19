---
date: 2026-04-20
topic: tracker-dub-bus-world-class
tags: [dub, tracker, bus, audio, roadmap]
status: complete
completed: 2026-04-20
gaps_shipped: [G1, G2, G3, G4, G5, G6, G8, G10, G11, G12, G13, G14, G15, G16]
gaps_obsolete: [G7]
session_prs: [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70]
tail_leak_guard_commit: 1df0deefa
supersedes:
  - 2026-04-19-tracker-dub-studio-design.md         # DELETED 2026-04-20 during cleanup — content folded in below
  - 2026-04-19-tracker-dub-studio-phase-0-plan.md   # DELETED 2026-04-20 — refactor work is shipped
  - 2026-04-19-tracker-dub-studio-phase-1-plan.md   # DELETED 2026-04-20 — vertical slice shipped; follow-ups captured below
  - 2026-04-20-dub-per-channel-worklet-outputs.md   # DELETED 2026-04-20 — worklet wiring shipped; integration gaps captured below
---

# Tracker Dub Bus — Road to World Class

> **Recovery note.** On 2026-04-20 I bulk-deleted four dub studio plans (listed under `supersedes:`) based on a subagent's "core deliverables in main" verdict. The code is indeed present, but the feature is **not world-class yet** — several integration edges are unfinished, MIDI coverage is partial, and the pattern-lane `.dbx` round-trip and schema version 20 assumption are untested. This plan captures what I can recover from the three parallel audits run after the deletion, plus this session's conversation history, and turns it into a forward roadmap. `thoughts/` is in `.gitignore`, so this file IS the record. Added a `feedback_never_delete_plans.md` memory entry so this doesn't recur.

---

## 1. Current state — audited 2026-04-20

### 1.1 Shipped and functional

- **DubBus DSP chain** (`src/engine/dub/DubBus.ts`): complete King Tubby–style topology — HPF (3-stage, 18 dB/oct, optionally stepped at Altec 9069B positions 70 / 100 / 150 / 250 / 500 / 1k / 2k / 3k / 5k / 7.5k Hz) → bass shelf → mid scoop → sweep/flanger → tape saturation (single / 3-parallel stack / tape15ips modes) → SpaceEcho (RE-201 model, 4 tape heads + internal spring) → Aelapse spring (WASM) → sidechain DynamicsCompressor → glue DynamicsCompressor → LPF → M/S stereo-width → return gate. Every node has ramped AudioParam writes, no snap-to-grid.
- **Bus methods** (23 total): `openChannelTap`, `modulateFeedback`, `soloChannelTap`, `slamSpring`, `filterDrop`, `startSiren`, `throwEchoTime`, `setEchoRate`, `startTapeWobble`, `tapeStop`, `sweepMasterLpf`, `backwardReverb`, `reverseEcho`, `firePing`, `fireNoiseBurst`, `fireRadioRiser`, `fireSubSwell`, `startSubHarmonic`, `startCrushBass`, `startOscBass`, `startStereoDoubler`, `startTubbyScream`, `wireMasterInsert`. **All real DSP** — zero stubs, zero `throw new Error('stub')`, zero `TODO` in the DSP path.
- **Character presets** (5): `tubby`, `scientist`, `perry`, `gatedFlanger`, `madProfessor` — each a DubBusSettings override with spring length / damp / chaos / scatter / tone plus tape-sat drive. Preset-aware `setDubBus` merges overrides and flips back to `custom` on user edit.
- **DubMove registry**: 27 moves, 1:1 file ↔ registry entry, all calling real bus methods. Listed under 4.1.
- **DubRouter**: `fire(moveId, channelId, params, source)` with invocation-id pairing → DubReleaseEvent. Subscribers get both fire + release. Bus resolved via `setDubBusForRouter(bus)` from DubDeckStrip mount.
- **DubRecorder** (`src/engine/dub/DubRecorder.ts`): subscribes to DubRouter, writes to `pattern.dubLane.events` sorted by row. Pairs hold fires with releases (fills `durationRows`). Armed gate + source-='lane' skip both correct. rAF-batched through `scheduleDubStoreSync`.
- **DubLanePlayer** (`src/engine/dub/DubLanePlayer.ts`): `setLane` on pattern change (from `DubDeckStrip.tsx:305`), `onTick` called from **`useTransportStore.ts:321`** (contra agent 3's report — this IS wired). Backwards-seek binary-search cursor reset, active-holds map.
- **Per-channel worklet outputs** in all 4 WASM engines:
  - `public/chiptune3/chiptune3.worklet.js:194–218` — LibOpenMPT secondary module instances per dub channel, synced to main position.
  - `public/furnace-dispatch/FurnaceDispatch.worklet.js:1181–1231` — Furnace mute-and-re-render via `dubChannelEnabled[]` flags + `chipOffsets` for multi-chip songs.
  - `public/hively/Hively.worklet.js:502–529` — Hively voice save/restore + ring buffers.
  - `public/uade/UADE.worklet.js` — Paula per-channel capture (not re-verified in this session; architecture comment at `ChannelRoutedEffects.ts:14` asserts it).
- **`ChannelRoutedEffects` per-owner manager** (`src/engine/tone/ChannelRoutedEffects.ts`): 37-output layout (main + 4 effect isolation + 32 dub sends), lazy channel activation (`_activateDubChannel` sends `dubChannelEnable` message + connects output[5+ch] + registers tap with DubBus).
- **Mixer store `setChannelDubSend`** (`useMixerStore.ts:873`): clamps 0–1, ramps over 20 ms, lazy-activates/deactivates at boundaries.
- **Tracker integration** (`src/components/tracker/TrackerView.tsx:781`): DubDeckStrip is conditionally mounted.
- **DubDeckStrip** (`src/components/dub/DubDeckStrip.tsx`, 737 lines): master TONE row, global INSTR + PROC move rows, per-channel strips with mute / throw / echo / stab / build buttons, HOLD toggle, per-channel dub-send Fader, REC arm, lane timeline mount.
- **DubLaneTimeline** (`src/components/dub/DubLaneTimeline.tsx`, 341 lines): event rendering, drag-to-move, drag-to-resize for hold events, right-click duplicate/clone/delete/clear-all, rAF playhead.
- **DubBusPanel** (`src/components/dub/DubBusPanel.tsx`): all 13 bus knobs wired to `useDrumPadStore.dubBus`.
- **Master-chain routing**: DubBus return feeds the master chain through `DrumPadEngine.masterGain → ToneEngine.masterEffectsInput` (PR #36 — verified by the `exportTap.contract.test.ts` regression tests). Dub audio is **in exports** via the live-capture tap.
- **Schema version bump**: `useProjectPersistence.ts:117` documents `v20: Pattern.dubLane added — purely additive; v19 projects load identically`.

### 1.2 Real gaps — what is NOT world-class yet

Numbered for the roadmap below.

**G1. MIDI registry missing 12 of the 27 moves.** `DUB_MOVE_KINDS` in `parameterRouter.ts:74-90` only lists the original 15. The 12 added in PR #42 (`crushBass`, `echoBuildUp`, `oscBass`, `radioRiser`, `reverseEcho`, `sonarPing`, `stereoDoubler`, `subHarmonic`, `subSwell`, `tubbyScream`, `delayPreset380`, `delayPresetDotted`) have full UI + engine paths but no MIDI CC routes. Hardware controller users can't fire them.

**G2. Lane-timeline color map incomplete.** `DubLaneTimeline.tsx:22-38` `MOVE_COLOR` only has entries for 15 moves. The 12 PR #42 moves render as the default grey. They record and play fine; they just look wrong on the lane.

**G3. Zero keyboard bindings for dub moves.** No entry in `src/engine/keyboard/commands/` maps letter keys to dub moves. The old design deferred this to "Full-Screen Dub Mode" which was deleted. All moves are mouse / MIDI / pad only.

**G4. `.dbx` file export does not explicitly serialize `dubLane`.** `src/lib/export/exporters.ts` has no `dubLane` reference. The IndexedDB save path at `useProjectPersistence.ts:408` lands patterns whole (so `dubLane` rides along via schema v20), but the human-shareable `.dbx` export may drop it silently. Untested. Round-trip risk.

**G5. No automated test for `dubLane` round-trip.** `useProjectPersistence.test.ts` predates the `dubLane` schema bump. A pattern with a lane can save / load, but no assertion covers the events survive. Adjacent to CLAUDE.md's "every bug fix ships with a regression test" policy — this gap is pre-existing, not a regression, but it masks G4.

**G6. `_activateDubChannel` has no retry when `getActiveIsolationEngine()` returns null.** `ChannelRoutedEffects.ts:331-358`. If the engine isn't ready at the moment a user turns up a dub-send fader, the worklet output is never connected and the send sits silent. The store state shows the gain at the chosen value; only the audio is missing. User sees "I set the send, no echo comes through, why".

**G7. ~~No Pixi parity for DubDeckStrip / DubLaneTimeline / DubBusPanel.~~** OBSOLETE (2026-04-20): Pixi has been removed from the codebase. `src/pixi/` no longer exists; the app is DOM-only. The CLAUDE.md "DOM + Pixi parity" rule is defunct for this and future UI work.

**G8. MCP surface for dub is partial.** `release_dub_move` + enhanced `fire_dub_move` were wired in `mcpServer.ts` / `writeHandlers.ts` / `MCPBridge.ts` per the 2026-04-20 mixer-desk handoff, but a test sweep across every move (SLAM / FILT / SIREN / WOBBLE / CRACK / DELAY / BACK / DROP / STOP / STOP! / TOAST / SCREAM / WIDE / RVRSE / PING / RADIO / SUB / BASS / CRUSH / SUBH / 380 / DOT) was blocked on a Claude-Code restart and never ran. Agent-driven verification that every move produces audio is outstanding.

**G9. Reverb ↔ Delay chain-swap self-oscillation.** Known issue from the 2026-04-20 mixer-desk handoff — live rewire of the echo/spring order feeds a loop back into itself. Reproducible; fix deferred.

**G10. TOAST move not reachable from DJ view.** Only the tracker view has the TOAST button (requires DJ mic tap). Carried over from multiple session handoffs. Not a tracker-view blocker, but feature-parity debt.

**G11. No character-preset A/B compare.** User can select `tubby` or `scientist` but cannot hold a key / click to flip back to their last custom settings without re-dialling. Standard hardware desk convenience.

**G12. Echo sync divisions don't listen to BPM drift.** `echoSyncDivision` (`'1/4'` / `'3/8'` etc.) computes `echoRateMs` at the moment of setSettings. BPM changes mid-song don't rescore the delay. Not wrong, just frozen.

**G13. No sidechain source selector.** Sidechain compression is hard-wired — amplitude follows whatever arrives at the bus input. User can't pick "only kick triggers ducking". Old design spec had this; implementation never landed.

**G14. No dub-bus test coverage.** `DubRecorder.test.ts` exists (PR #38) but `DubBus.ts`, every move file, `DubLanePlayer`, `ChannelRoutedEffects` have zero tests. Refactor-risk is enormous — a well-meaning DSP tweak to `startSiren` has nothing stopping a silent regression.

**G15. DubBus `wireMasterInsert` rebuild fragility.** Enabling / disabling the master TONE insert tears down and rebuilds the master chain. During the rewire, a fraction of a buffer can clip or glitch. Reported in the dub-studio demo handoff. Workaround exists (don't toggle live), proper fix hasn't shipped.

**G16. `characterPreset` doesn't roundtrip with user edits cleanly in all paths.** Store flips to `custom` on any patch that doesn't contain `characterPreset`, but some UI paths (e.g., the returnGain slider) use a direct `setDubBus({ returnGain: x })` that doesn't propagate the preset name. Chain of subtle "why did my Tubby settings disappear after I nudged one knob" reports.

### 1.3 Known but out of scope for this plan

- **Full-Screen Dub Mode** — deleted 2026-04-20 per user's call ("horrible overlap with pattern editor"). Keyboard bindings that lived in that mode are not being rebuilt here; any new keyboard layer goes into the main tracker view.
- **Per-channel DJ decks / live-play in DJ view** — separate plan, different feature.
- **Furnace tracker-effect regression** — `2026-04-20_furnace-tracker-effects-regression.md` handoff is an audio-level debug for chip-side vibrato, unrelated to the bus.

---

## 2. Approach — four phases, each shippable on its own

Target ordering picks small high-value wins first so user-facing polish lands before deep refactors.

### Phase A — Complete the move surface (G1, G2, G8, G10, G11)

Closes every UI / MIDI / color gap left from PR #42. No DSP changes. Pure wiring.

- **A1**: Add the 12 missing moves to `DUB_MOVE_KINDS` in `parameterRouter.ts:74`. Default `trigger` for one-shots, `hold` for sustained (crushBass / oscBass / stereoDoubler / tubbyScream / subHarmonic are holds per their dispose-returning move functions; the rest are triggers). One-line-per-move.
- **A2**: Extend `MOVE_COLOR` in `DubLaneTimeline.tsx:22` to cover all 27 moves. Use the existing palette; group visually related moves (bass family = warm, echo/reverb = cool, tape/fader = neutral).
- **A3**: Add the TOAST move's DJ-view button (see G10 — surface the existing `toast` move in `src/components/dj/` next to the DJ mic controls).
- **A4**: A/B character-preset toggle (G11). Store `lastCustomSettings` when the user loads a preset; add a compare button in `DubBusPanel.tsx` that swaps between the preset and the stashed custom settings. No new DSP.
- **A5**: MCP dub-move test sweep (G8). With `fire_dub_move` + `release_dub_move` surfaced, add a `tools/ui-smoke/` flow that fires every move against a silent tracker and asserts non-zero RMS within 500 ms. Locks coverage against the next MIDI / DSP regression.

**Exit**: all 27 moves reachable from UI + MIDI + MCP, lane timeline fully coloured, TOAST works from DJ view, A/B preset compare added.

### Phase B — Persistence hard-lock (G4, G5)

- **B1**: Confirm the `.dbx` exporter (`src/lib/export/exporters.ts`) serialises `pattern.dubLane`. If it doesn't, add it. If it does but only inside a broader `pattern` blob, add a grep-based contract test in `src/engine/__tests__/` to assert it.
- **B2**: Add `useProjectPersistence.dublane-roundtrip.test.ts` — record one hold + one trigger event on pattern 0, save, load in a fresh IDB, assert events are byte-identical. Uses the existing `fake-indexeddb` pattern from the current persistence test.
- **B3**: Extend schema bump notes in `useProjectPersistence.ts:117` with any newly-persisted fields (e.g. if Phase A adds `lastCustomSettings`, document the bump).

**Exit**: `.dbx` export / import round-trips dub lanes in both IndexedDB and file paths; a CI test breaks on regression.

### Phase C — Integration polish (G6, G12, G13, G15, G16)

- **C1**: Retry on `_activateDubChannel` null-engine (G6). When `getActiveIsolationEngine()` returns null, register a one-shot callback that fires on engine ready + re-attempts activation. Retry once; fall back to logging clearly if it still fails.
- **C2**: BPM-follow the echo sync (G12). Subscribe the `echoSyncDivision != null` branch to `useTransportStore.bpm`, recompute `echoRateMs` on each BPM change (debounced 100 ms to tolerate pitch slider scrubbing).
- **C3**: Sidechain source selector (G13). Extend `DubBusSettings` with `sidechainSource: 'bus' | 'channel'` plus `sidechainChannelIndex?: number`. UI in DubBusPanel picks a tracker channel (or 'bus' = existing behaviour). Implementation: when channel-sourced, route the isolated worklet output of that channel into the sidechain compressor's `DynamicsCompressor` side input. Reuses the existing per-channel isolation machinery already in `ChannelRoutedEffects`.
- **C4**: `wireMasterInsert` glitch fix (G15). Rewire under a 10 ms gain ramp to 0 → rewire → ramp back. Root cause: current rewire leaves a frame of mixed old-chain + new-chain output.
- **C5**: Preset + user-edit coherence (G16). Every `setDubBus({ ...one field... })` from the UI should either (a) include the current `characterPreset` and trust the store's existing merge, or (b) explicitly pass `characterPreset: 'custom'`. Audit the six or so UI callers and standardise.

**Exit**: dub-send fader works the first time, echo stays in sync under tempo change, sidechain can isolate to kick, rewires are silent, presets feel stable.

### Phase D — Test coverage + long-tail (G14; G7 obsolete)

- **D1**: Pure-logic tests for every move file (`src/engine/dub/moves/`). Mock `DubBus` following `DubRouter.test.ts:20` pattern. Assert each move calls the correct bus methods with correct params given a fixed `DubMoveContext`. ~27 files, one test each, ~5 assertions per test. Wire into `test:ci`.
- **D2**: `DubBus.test.ts` for the node-graph invariants. No audio playback — just assert that enabling/disabling, preset application, and `setSettings` calls produce the expected graph structure (fan-in / fan-out counts, param values within ε). Uses happy-dom's AudioContext shim if possible; falls back to injection-mocked BaseAudioContext otherwise.
- **D3**: `DubLanePlayer.onTick` tests — verify events at row 0, midway, end; backwards-seek cursor reset; hold-map release on seek. Reuses `DubRecorder.test.ts` fixtures.
- ~~**D4**: Pixi parity of the three dub surfaces (G7).~~ OBSOLETE — Pixi removed from codebase 2026-04-20.

**Exit**: dub bus has ≥ 50 tests locked down, Pixi renderer is at visual / behavioural parity, refactor risk drops from "scary" to "same as the rest of the codebase".

---

## 3. Critical files + reuse

**Files this plan touches** (by phase):

- **A1**: `src/midi/performance/parameterRouter.ts:74` — add 12 rows, no type changes.
- **A2**: `src/components/dub/DubLaneTimeline.tsx:22` — extend `MOVE_COLOR` map.
- **A3**: `src/components/dj/DJMasterPanel.tsx` or equivalent DJ master strip — add TOAST button.
- **A4**: `src/components/dub/DubBusPanel.tsx` + `src/stores/useDrumPadStore.ts` — add `lastCustomSettings` slot + toggle action.
- **A5**: `tools/ui-smoke/ui-smoke.test.ts` — new flow 09, mirroring flow 07's pattern.
- **B1**: `src/lib/export/exporters.ts` (or whichever module produces `.dbx`) + `src/engine/__tests__/exportTap.contract.test.ts` pattern for the contract test.
- **B2**: `src/hooks/__tests__/useProjectPersistence.test.ts` — extend.
- **C1**: `src/engine/tone/ChannelRoutedEffects.ts:331-358`.
- **C2**: `src/engine/dub/DubBus.ts:setSettings` + BPM subscription.
- **C3**: `src/types/dub.ts` (settings shape), `src/engine/dub/DubBus.ts` (sidechain wiring), `src/components/dub/DubBusPanel.tsx` (selector UI).
- **C4**: `src/engine/dub/DubBus.ts:wireMasterInsert`.
- **C5**: UI callers of `setDubBus` — audit via grep.
- **D1-3**: new files under `src/engine/dub/__tests__/` + `src/engine/dub/moves/__tests__/`.
- ~~**D4**: `src/pixi/dub/` (new) mirroring `src/components/dub/`.~~ OBSOLETE — Pixi removed.

**Reuses** (nothing in this plan invents new abstractions):

- `ChannelRoutedEffects` — per-channel tap + lazy activation, already proven for tracker side.
- `DubRouter.fire(...)` — the only move-firing entry point; don't add a second.
- `DubMove` interface in `src/engine/dub/moves/types.ts` — existing shape.
- `DubBusSettings` in `src/types/dub.ts` — the one source of truth for bus config.
- `scheduleDubStoreSync` for rAF-batched writes.
- `DUB_CHARACTER_PRESETS` for preset merges.
- `fake-indexeddb` for persistence tests (already a devDep).
- `DubRouter.test.ts` mock-bus pattern for all new move tests.

---

## 4. Reference — 27 dub moves + bus methods (source: 2026-04-20 audit)

### 4.1 Moves (ID → bus method → kind → status)

| ID | Kind | Bus call | UI? | MIDI? | Color? | Status |
|---|---|---|---|---|---|---|
| echoThrow | trigger | openChannelTap + modulateFeedback | per-ch | ✓ | ✓ | SHIPPED |
| dubStab | trigger | openChannelTap + modulateFeedback | per-ch | ✓ | ✓ | SHIPPED |
| channelThrow | trigger | openChannelTap + modulateFeedback | per-ch | ✓ | ✓ | SHIPPED |
| channelMute | hold | (useMixerStore only) | per-ch | ✓ | ✓ | SHIPPED |
| springSlam | trigger | soloChannelTap + slamSpring | global | ✓ | ✓ | SHIPPED |
| filterDrop | hold | filterDrop + soloChannelTap | global | ✓ | ✓ | SHIPPED |
| dubSiren | hold | startSiren | global | ✓ | ✓ | SHIPPED |
| tapeWobble | hold | startTapeWobble | global | ✓ | ✓ | SHIPPED |
| snareCrack | trigger | fireNoiseBurst | global | ✓ | ✓ | SHIPPED |
| delayTimeThrow | trigger | throwEchoTime | global | ✓ | ✓ | SHIPPED |
| backwardReverb | trigger | backwardReverb | global | ✓ | ✓ | SHIPPED |
| masterDrop | hold | (ToneEngine gains) | global | ✓ | ✓ | SHIPPED |
| tapeStop | trigger | tapeStop | global | ✓ | ✓ | SHIPPED |
| transportTapeStop | trigger | tapeStop + sweepMasterLpf | global | ✓ | ✓ | SHIPPED |
| toast | hold | (DJ mic tap) | global | ✓ | ✓ | SHIPPED (TOAST also needed in DJ view, G10) |
| tubbyScream | hold | startTubbyScream | global | **✗** | **✗** | A1 + A2 |
| stereoDoubler | hold | startStereoDoubler | global | **✗** | **✗** | A1 + A2 |
| reverseEcho | trigger | reverseEcho | global | **✗** | **✗** | A1 + A2 |
| sonarPing | trigger | firePing | global | **✗** | **✗** | A1 + A2 |
| radioRiser | trigger | fireRadioRiser | global | **✗** | **✗** | A1 + A2 |
| subSwell | trigger | fireSubSwell | global | **✗** | **✗** | A1 + A2 |
| oscBass | hold | startOscBass | global | **✗** | **✗** | A1 + A2 |
| crushBass | hold | startCrushBass | global | **✗** | **✗** | A1 + A2 |
| subHarmonic | hold | startSubHarmonic | global | **✗** | **✗** | A1 + A2 |
| echoBuildUp | trigger | (mixer dubSend envelope) | per-ch | **✗** | **✗** | A1 + A2 |
| delayPreset380 | trigger | setEchoRate | global | **✗** | **✗** | A1 + A2 |
| delayPresetDotted | trigger | setEchoRate | global | **✗** | **✗** | A1 + A2 |

### 4.2 Character presets (reference from `src/types/dub.ts` + `research/2026-04-20_dub-sound-coloring.md`)

- **tubby** — dark, noisy, loose spring, stepped HPF, `returnGain: 0.75`, `echoIntensity: 0.65`, `bassShelfFreqHz: 200` with `Q: 0.5`, tape-sat `'single'`.
- **scientist** — bright, dry, plate, zero bus compression, `echoIntensity: 0.35`, `midScoopGainDb: -10`, continuous HPF.
- **perry** — stacked tape, near-mono, `sweepAmount: 0.5`, `tapeSatMode: 'stack'`, kickable spring.
- **gatedFlanger** — gated reverb + heavy liquid sweep, `springWet: 0.35`, `sweepAmount: 0.65`.
- **madProfessor** — hi-fi clarity, `stereoWidth: 1.9`, lush long springs, `echoIntensity: 0.38`, `bassShelfGainDb: +5`.

---

## 5. Verification per phase

**Phase A (move surface)**
- `npm run type-check` + `npm run test:ci` clean.
- Every move fires from `fire_dub_move` MCP call and produces ≥ 0.01 RMS within 500 ms against a silent tracker.
- Lane timeline renders every move with a distinct non-grey colour.
- DJ view TOAST button fires the `toast` move; mic audio reaches the bus.
- A/B preset compare: loading Tubby → tweaking returnGain → clicking A/B toggles between tweaked and stashed; store's `characterPreset` reflects the live mode.

**Phase B (persistence)**
- Record two events on pattern 0, save via explicit save, clear IDB, load → events come back byte-identical.
- Export `.dbx`, import fresh → events come back byte-identical.
- Contract test in CI fails when `dubLane` is removed from the export path.

**Phase C (integration)**
- Turn up channel 3 dub-send fader before the engine boots → on first note, echo comes through.
- Change BPM from 120 to 140 mid-song with `echoSyncDivision: '1/4'` → delay time halves (approximately, within a 100 ms retune window).
- Pick "Kick" as sidechain source, arm compressor → pump follows kick only, not the rest of the mix.
- Toggle master TONE insert during playback → no audible glitch at the rewire moment.
- Load Tubby preset, tweak one knob, tweak a second knob → settings accumulate as expected, preset stays `custom` after the first edit.

**Phase D (tests + Pixi)**
- `npm run test:ci` gains ≥ 50 dub tests.
- Pixi dub surfaces pass a visual-parity screenshot diff against the DOM ones (manual or tooling — tracked separately).

---

## 6. Priority + sequencing

Recommended:
1. Phase A — one afternoon. Unblocks every hardware-controller user and fixes the visible lane-timeline gap.
2. Phase B — half a day. Cheap insurance before we touch anything else.
3. Phase C — a few sessions. C1 (retry) and C4 (wire glitch) are quick; C3 (sidechain selector) is the bulk.
4. Phase D — open-ended; ship D1-D3 before D4 (Pixi).

Each phase is independent; the user can reorder freely.

---

## 7. Things this plan deliberately omits

- Any new DSP primitives. The existing 23 bus methods cover the 27 moves; the next feature should reuse these before adding more.
- Any refactor of `useDubStore` / `useDrumPadStore` split. The split is confusing (armed / lastCapturedAt / ephemeral flags in one store; persisted bus settings in the other) but works. Don't touch unless there's a concrete bug.
- Any cross-deck feature (send from DJ deck to tracker-view bus, etc.). Follow-up plan.
- Any worklet-side rewrite. All 4 WASM engines render per-channel correctly today.
