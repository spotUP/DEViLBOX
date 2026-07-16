---
date: 2026-07-16
topic: suntronic-gateB2-native-song-playback
tags: [suntronic, phase4, native-playback, worklet, engine, gate-b2]
status: implemented
---

# Gate B.2 plan — SunTronic native song playback in the browser

Research: `thoughts/shared/research/` (integration-surface map, 2026-07-16 agent).
Prereqs: Gate B.1 (offline native-mix), Gate C (synth timbres), Gate D (sampled) — all DONE.

## Goal

A loaded SunTronic `.src`/`.pc` module plays through the **native**
`SunTronicPlayer` timeline + Paula resampler in the browser (no UADE at runtime),
**behind the existing `prefKey: 'suntronic'` toggle**. Default stays UADE until
Gate E locks whole-song fidelity and flips the default. This makes native
playback opt-in/testable now without shipping the known-imperfect audio
(synth voices windowed 0.2-0.65, sampled unlocked) as the default path.

## Non-goals (deferred)

- Whole-song byte-exact fidelity (Gate E, gated on cycle-accurate Paula-DMA).
- Flipping the default from UADE to native (Gate E).
- Live-edit re-render latency tuning (v1 rebuilds player on song change only).

## Current state (from research)

- `SunTronicPlayer.tick()` streams per-tick voice state (period/outVolume/
  instrOff/sampleSlot/loop*/flags); `seqEndKind:'restart'` loops internally →
  infinite streaming, no fixed length.
- `tools/suntronic-re/native-mix.ts` is the proven offline renderer (player →
  renderSynthTick per vblank → Paula resampler → 0+3/1+2 stereo law). **Node-only**
  (reads corpus + companions via `fs`).
- Runtime routing is parse-time: `withNativeDefault` (`withFallback.ts:71`) runs
  the native parser then `injectUADEPlayback` sets `uadeEditableFileData` UNLESS
  the result carries a dedicated-WASM flag (`hasDedicatedWasm` allowlist, line 55).
- Engine dispatch: `NativeEngineRouting.ts` `WASM_ENGINES[]` — an entry activates
  when `song[fileDataKey]` exists (UADEEditableSynth @815-844 is the template).
- Existing native engines load a **static** `public/<dir>/*.worklet.js` (Cinter4,
  UADE) via `WASMSingletonBase` + `audioWorklet.addModule`. **No TS→AudioWorklet
  bundling exists in the build.**
- Companions: `UADEEngine.addCompanionFile` posts each sidecar to the worklet VFS
  before load; import dialog supplies them (`useImportDialog.ts:167`); persistence
  via `SerializedCompanionFiles` (`exporters.ts`).

## Architecture decision — where does `tick()` run?

Streaming (worklet owns the sample clock) is settled. The open fork is the
thread split:

**Option A — full player in the worklet.** Bundle `SunTronicPlayer` +
`SunTronicSynthVoice` + deps into one AudioWorklet JS. `process()` runs tick() on
the vblank grid + resamples inline.
- Cost: introduces TS→AudioWorklet bundling infra (a dedicated Vite/rollup entry
  emitting `public/suntronic/suntronic-song.worklet.js`). None exists today; Vite
  does not bundle AudioWorklet modules out of the box. Real, one-time infra risk.
- Wins: zero cross-thread timing; synth regen and resampler stay sample-tight
  (the exact coupling Gate C proved matters).

**Option B — hybrid: player on main thread, thin resampler worklet.** Main thread
runs `tick()` ahead of playback and posts a lookahead queue of per-vblank "voice
frames" (period, gain, and either a 128-byte synth buffer or a sampled-slot ref +
phase params). A small **hand-written** `public/suntronic/suntronic-resampler.worklet.js`
(Cinter4-style, no bundling) owns the sample clock, applies each frame at its
vblank boundary, resamples + mixes.
- Cost: cross-thread lookahead/underrun handling (ring buffer, ~100-200 ms lead);
  posting ~4×128 B per vblank (~25 KB/s) is trivial bandwidth.
- Wins: NO new bundling infra; player stays exactly where it runs today (main
  thread / tests); worklet is small and static like the existing pattern.
- Timing: sample-tightness preserved because the worklet applies frames on its
  own vblank counter — the player only needs to stay ahead, not sample-aligned.

**Recommended: Option B (hybrid).** Decisive trade-off: Option A's TS→AudioWorklet
bundling is unproven infra in this repo and the highest-risk part of the whole
gate, while B reuses the established static-worklet pattern and keeps the
byte-exact player on the thread it's already validated on. The vblank-frame
contract is the same control-rate/audio-rate split real trackers use to drive
Paula, and the worklet owning the sample clock is what actually guarantees
sample-tightness — not co-locating the code. Revisit A only if the lookahead
queue proves to add audible jitter (it should not — frames are applied on integer
vblank boundaries the worklet computes itself).

## Implementation status (2026-07-16) — code DONE, MCP evidence PENDING

Architecture chosen: **Hybrid** (worklet does NOT synthesize). The byte-exact
player + Paula render runs main-thread; a pump posts finished 44100 Hz stereo
chunks to a thin resampler worklet (ring buffer + 44100→ctxRate SRC). This keeps
ONE copy of the Paula/timbre math shared with the offline oracle. The Phase 2/3
prose below describing worklet-side frame synthesis is SUPERSEDED by this.

Done (all uncommitted):
- **Phase 1** `src/engine/suntronic/SunTronicNativeRender.ts` — fs-free streaming
  render core (`SunTronicNativeRenderer.renderInto`, `renderSunTronicMix`).
  `native-mix.ts` slimmed to fs wrapper; fidelity byte-identical (re-verified 2×).
- **Phase 2** `public/suntronic/SunTronicResampler.worklet.js` — pure-JS ring +
  linear SRC + transport; posts `consumed`/`underrun` back.
- **Phase 3** `src/engine/suntronic/SunTronicSongEngine.ts` — STANDALONE singleton
  (not WASMSingletonBase — it always fetches wasm → 404). addModule + worklet node
  + output GainNode; `loadTune` parses score, resolves slot PCM by basename, builds
  renderer, prefills LOOKAHEAD (~350 ms), `setInterval(40 ms)` pump tops up. Q2
  resolved: setInterval, not rAF (survives background-tab rAF throttling).
- **Phase 4** routing: `WASM_ENGINES[]` entry `SunTronicSong`
  (`fileDataKey:'sunTronicSongFileData'`, companions via getLoadArgs); TrackerSong
  fields `sunTronicSongFileData` + `sunTronicCompanionPcm`; AmigaFormatParsers
  SunTronic dispatch attaches them ONLY when `prefs.suntronic==='native'` &&
  `isSunTronicV13Format` (raw .sun/.tsm stay UADE); both withFallback
  `hasDedicatedWasm` allowlists gained `sunTronicSongFileData`.
- **Phase 5** — companions reuse existing `companionFiles` Map (same plumbing the
  UADE SunTronic path already used); missing → silent voice (engine handles null).
  No new fetch code needed.
- **Phase 6 (regression)** `sunTronicNativeRender.test.ts` in test:ci — chunked ==
  whole-song byte-identical across ragged sizes + Gate D voice 2 not silent.

Verified: `npm run type-check` clean; SunTronic tests 3 files / 14 assertions green.

PENDING (needs live stack + user click-to-unlock — cannot run headless):
- **Phase 6 (MCP evidence)**: `npm run dev`, open localhost:5174, click to unlock,
  set SunTronic engine pref = native, load a native `.src`, `get_audio_level`>0,
  `get_console_errors` clean, `stop`.
- Docs/memory update; default stays UADE (Gate E flips it).

## Phases

### Phase 1 — browser-safe native renderer core (extract from native-mix)
Extract the pure render logic from `tools/suntronic-re/native-mix.ts` into a
shared, fs-free module `src/engine/suntronic/SunTronicNativeRender.ts`:
- Input: `SunV13Score` + `sampleData: (Int8Array|null)[]` (companion PCM by slot).
- Export a `SunTronicVblankFrameSource` that, given a player, yields per-vblank
  voice frames (the Option-B contract): `{ period, gain, kind:'synth'|'sample',
  synthBuf?: Int8Array, sampleSlot?, phaseInc, loopStartBytes, loopLenBytes }`.
- `native-mix.ts` (node tool) re-imports this core so the offline oracle and the
  runtime share ONE render path (single source of truth — no duplicated Paula
  law / resampler). Node tool keeps its fs loaders + fidelity report.
- Automated verify: `native-mix.ts` fidelity numbers unchanged after refactor
  (gliders/ballblaser/analgestic2 identical to pre-refactor run).

### Phase 2 — resampler worklet
`public/suntronic/suntronic-resampler.worklet.js` (hand-written, no bundling):
- Registers `suntronic-resampler`; 1 stereo output.
- Message: `{type:'frames', frames:[...vblankFrames], startVblank}` appended to a
  ring buffer; `{type:'play'|'stop'|'reset'}`; `{type:'companions', slotPcm}`
  (Int8Array per slot, transferred once).
- `process()`: free-running sample + vblank counters; at each vblank boundary pull
  the next frame set; per voice resample (synth buf loop / sample one-shot+loop,
  same law as the core); mix 0+3→L, 1+2→R; emit `position`/`scope` messages like
  Cinter4 for UI sync. Underrun → hold last frame + post `underrun` (main thread
  widens lookahead).

### Phase 3 — engine singleton
`src/engine/suntronic/SunTronicSongEngine.ts` extends `WASMSingletonBase`-style
singleton (or a lighter base — no WASM here, so a plain singleton mirroring the
worklet-node lifecycle):
- `getLoaderConfig`: dir `suntronic`, worklet `suntronic-resampler.worklet.js`,
  no wasm/js. (If `WASMSingletonBase` hard-requires wasm, add a no-wasm base or a
  thin `addModule` + `AudioWorkletNode` wrapper.)
- `loadTune(score, companionPcm)`: build `SunTronicPlayer`, post companions,
  start a main-thread pump (rAF/timer) that runs `tick()` → vblank frames →
  `port.postMessage('frames')` keeping ~150 ms lookahead.
- `play()/stop()`: gate the pump + worklet transport. Output GainNode → master.
- Reuse Cinter4Engine's port.onmessage shape ('ready'/'position'/'scope'/'error').

### Phase 4 — parser + routing
- `SunTronicParser` (native path): attach `sunTronicSongFileData` (the `SunV13Score`
  or enough to rebuild it) + `sunTronicCompanionPcm` (slot→Int8Array) to the
  `TrackerSong` result.
- `withFallback.ts:55`: add `sunTronicSongFileData` to the `hasDedicatedWasm`
  allowlist so native SunTronic songs DON'T get `uadeEditableFileData` and thus
  bypass UADE at runtime — **only when `prefs.suntronic === 'native'`** (guard the
  attach on the pref so default stays UADE).
- `NativeEngineRouting.ts`: add a `WASM_ENGINES[]` entry `key:'SunTronicSong'`,
  `fileDataKey:'sunTronicSongFileData'`, `synthType:'SunTronicSongSynth'`,
  `suppressNotes:true`, `loadMethod:'loadTune'`.

### Phase 5 — browser companion fetch
Sampled songs need `instr/*` PCM at runtime. Two sources, in priority order:
1. Companions already supplied (import dialog / project restore) — reuse the
   existing `companionFiles` Map (`useImportDialog.ts:167`, `useFormatStore`).
2. For corpus/HVSC-style loads where the module lives at a known URL, fetch
   `<moduleDir>/instr/<name>` relative to the module URL (mirror how UADE-side
   sidecars are located). Missing → that voice renders silent (already the
   player's "companion absent" contract; log a warning, don't throw).
Map slot→PCM via `score.instrumentNames` (Gate D's `loadSlotPcm` order).

### Phase 6 — regression + evidence
- `src/engine/suntronic/__tests__/sunTronicNativeRender.test.ts` (test:ci):
  drives the extracted core headless — asserts vblank-frame output for
  analgestic2 (voice 2 sampled slot0 frames present, synth voices carry 128-byte
  bufs), and that the mixed PCM equals the pre-refactor native-mix buffer
  (byte-identical) → fails on revert of the core extraction.
- Worklet + engine are integration-tested via the DEViLBOX MCP in real Chrome
  (load `.src` with `suntronic:'native'`, `get_audio_level` > 0, `get_console_errors`
  clean, `stop` after). NOT a vitest (worklet needs a real AudioContext).
- Update `docs/` + memory; keep default UADE (Gate E flips it).

## Open questions to resolve before Phase 3
1. Does `WASMSingletonBase` tolerate a no-WASM engine, or is a sibling base
   (`WorkletSingletonBase`) needed? (Read `WASMSingletonBase.ts:139-200`.)
2. Lookahead pump cadence: rAF (~16 ms) vs a `setInterval` at ~50 ms with 150 ms
   lead — pick after measuring underrun margin on a throttled tab.
3. Position/scope message shape reuse vs SunTronic-specific fields for the grid
   follow-cursor.

## Automated verification (per phase)
- Phase 1: `npx tsx tools/suntronic-re/native-mix.ts` fidelity == pre-refactor.
- Phase 1/6: `npm run test:ci` incl. `sunTronicNativeRender.test.ts`.
- All phases: `npm run type-check` clean.
## Manual verification (human)
- MCP real-Chrome: load native `.src`, hear playback, level>0, no console errors,
  grid follow-cursor tracks, stop cleanly. Sampled song (analgestic2) voice audible.
