---
date: 2026-07-16
topic: suntronic-phase4-native-playback
tags: [suntronic, phase4, native-playback, waveform-re, uade-oracle]
status: draft
---

# SunTronic Phase 4 — Full native playback

## Goal

SunTronic plays fully native (no UADE at runtime): the byte-exact native
`SunTronicPlayer` timeline drives a 4-voice Paula-emulating renderer to stereo
PCM, wired through an AudioWorklet + engine + registry, selectable in settings,
eventually the default. UADE stays as the OFFLINE audio oracle only.

## Where we start (research 2026-07-16, all confirmed)

First-class **editable** is DONE: byte-exact tick-grid (`uadeVariableLayout`
carriers), instruments (synth+sampled), companion `.instr/.ss`/`.x` loading,
export round-trip (`SunTronicExporter`), registry entries
(`FormatRegistry` 2162, `AmigaFormatParsers` 2382, `EditableFormatRegistry`
114). Playback today = **UADE fallback** (`injectUADE`, `uadeEditableFileData`).

Native **playback** is the gap. What exists in `src/engine/suntronic/`:
- `SunTronicPlayer.ts` — byte-exact SEQUENCER. `tick()` returns per-1024-bucket
  `{voices:[{period,acc,volume,flags}×4]}`. Gate 1-2: gliders 0/316, ballblaser
  1/316. Does NOT expose which INSTRUMENT is active per voice. Not wired to audio.
- `SunTronicSynthVoice.ts` — MEGAEFFECTS waveform generator. **Only synthType
  0/2 are exact ports; 1/4/5/6 oracle-pending.**
- `SunTronicEffects.ts` — pitch/volume/period math (exact).
- `SunTronicVoiceRenderer.ts` — SINGLE-note audition (one instrument, one pitch,
  its OWN effects loop). NOT the whole-song path. No sampled-instrument support.
- `SunTronicSynth.ts` — editor-audition DevilboxSynth voice.

Songs need the pending timbres:
- gliders: 17 synth (types 6,1,5,4 dominate — 15/17 pending) + **2 sampled**.
- ballblaser: 4× t2 (exact) + 1× t5 (pending) + **1 sampled**.

So native audio is WRONG today for both songs. Phase 4 is a second RE effort
(lock waveform timbres + sampled DMA), not a wiring task.

## Oracle infrastructure (confirmed available on the SHIPPED clean build)

`public/uade` (sha1 cc3a153/520744b) already exports:
- `uade_wasm_read_channel_samples(ch0,ch1,ch2,ch3,maxFrames)` → **per-Paula-voice
  mono float PCM** captured during the last `uade_wasm_render()`.
- `uade_wasm_mute_channels(mask)` — isolate channels.
- `uade_wasm_read_memory`, `get_channel_extended` — register/DMA snapshots.

This is the decisive oracle: native single-voice render vs UADE `ch_i` PCM. No
instrumented WASM, no submodule edits — reuse `tools/uade-audit/uadeRenderCore`.

## Gates

### Gate A — audio oracle harness  ← START HERE
Build `tools/suntronic-re/audio-oracle.ts`:
- Render gliders/ballblaser whole-song via UADE, pull ch0-3 float PCM per voice
  into reference arrays (+ optional WAV dump to scratchpad for listening).
- Provide a per-voice metric (normalized cross-correlation + RMS-diff over a
  window) against an arbitrary native Float32 buffer.
- Provide instrument-isolation: given the native timeline (which instrument on
  which voice at which tick), pick a window where voice v plays instrument k at
  a steady period → extract UADE ch_v slice as the single-instrument oracle.
Deliverable: a reusable oracle module + a baseline report (correlation of the
current `SunTronicVoiceRenderer` synth-only mix vs UADE per voice) that
quantifies exactly how wrong each timbre is. No shipped code changed.

### Gate B — native playback plumbing
Reordered pragmatically: build the OFFLINE native mix FIRST (measurable against
the Gate A oracle) so the worklet is wrapped around KNOWN-good audio, not guesses.

**B.1 — offline native mix + fidelity report  ← DONE (2026-07-16)**
- `SunTronicPlayer.tick()` now exposes per-voice `outVolume` ($15 post-envelope
  Paula gain) + `instrOff` (active synth record offset, -1 = none/sampled).
  Additive change; both byte-exact regressions still pass.
- `tools/suntronic-re/native-mix.ts`: drives the byte-exact timeline through
  `renderSynthTick` (timbre) + a Paula wavetable resampler, one mono buffer per
  voice, mixes 0+3→L / 1+2→R. `voiceFidelity()` = median best-lag windowed
  correlation vs the oracle (the RIGHT metric — global correlation is meaningless
  because native and UADE Paula drift ~hundreds of samples in phase over seconds
  even when the per-frame waveform is byte-correct).
- **Measured findings (native-mix.ts CLI):**
  - gliders v1/v2/v3 synthType-2: fidelity **0.79–0.85** — the exact-port claim
    for type 2 is validated against real audio for the first time.
  - gliders v0 synthType-6 (lead): **SILENT** — `wave1Off=0x3a98` (15000) points
    OUTSIDE both loaded hunks (hunk0 code 436B + hunk1 data 8776B; NO 3rd hunk).
    `w2Off=0xff00ff20`, `arpLen=1066` — these t6 records clearly use a different
    field layout / data source than the in-h1 t6 records (off5670/5814/5850/5958
    have valid 128-byte wave1). TOP GATE C BLOCKER: where does UADE get the t6
    lead's wave data (loudest oracle voice)? companion? generated? BSS scratch?
  - ballblaser v0/v3 synthType-2: fidelity **0.47** — same type as gliders but
    lower; a second-order timbre/resampler gap (native near-clip 0.992 peak).

**B.2 — in-app worklet plumbing  ← NEXT (after Gate C lands audible timbres)**
- `SunTronicEngine.ts` (JS worklet engine, `Cinter4Engine` template) +
  `public/suntronic/SunTronic.worklet.js`: 4 voice renderers, `tick()` per 1024
  bucket, mix Paula 0+3→L / 1+2→R, position + oscilloscope messages.
- `TrackerSong` field for the native carrier (reuse `uadeEditableFileData` bytes;
  worklet re-parses via bundled `parseSunTronicV13Score`).
- `WASM_ENGINES[]` descriptor + dynamic resolver; `suppressNotes: true`.
- `useSettingsStore`: `suntronic: 'uade' | 'suntronic-native'` (default `uade`
  until fidelity locked).
Rationale for the reorder: no point wrapping a worklet around audio that is
silent on the lead voice. B.2 lands once Gate C makes the timbres audible.

KNOWN APPROXIMATION carried into B.2/Gate C: native-mix regenerates the timbre
buffer ONCE per 1024 bucket; the replayer regenerates per player-step (twice on a
double-position bucket → arp advances twice). Second-order for arpLen≤1 timbres
(gliders off6066 arpLen=1) but must be fixed for arp-driven ones.

### Gate C — lock synth timbres 1/4/5/6 + resolve t6 wave data
**C.0 (blocker, do first): t6 wave-data resolution.** gliders' lead (off5490,
t6) has `wave1Off` past the end of every loaded hunk yet UADE renders it as the
loudest voice. Some t6 records point in-h1 (off5670 etc.), some don't (5490/5886
out of range, 5778 = 0). Disassemble how MEGAEFFECTS dereferences record+0x1a for
type 6 (relocation? runtime BSS workspace like `drin`? companion sample? a
generated seed?) — oracle-trace the chip-RAM wave buffer if needed. Until this is
solved the lead voice is silent and no fidelity number is meaningful for t6.

Then: disassemble the MEGAEFFECTS branch selector (record+0x23) for each pending
synthType; port each into `SunTronicSynthVoice`; oracle-verify per instrument
(single-note isolation vs UADE ch_v, `voiceFidelity` from native-mix.ts) to
byte/near-sample exact. One timbre per sub-session. Regression per timbre. Also
close the ballblaser type-2 0.47 gap (already-ported type, so likely the
per-bucket-vs-per-step arp regen or resampler aliasing, not the timbre math).

### Gate D — sampled-instrument DMA rendering
Companion `.x`/`.instr`/`.ss` sample data → Paula one-shot/loop DMA at the
player's period/volume. Oracle-verify the sampled voices.

### Gate E — whole-song fidelity lock + default flip
Whole-song native mix vs UADE stereo within tolerance for both songs; add a
headless regression to test:ci; flip default to `suntronic-native`; keep UADE
fallback reachable. Un-skip nothing that needs 0/0 timeline (that stays as-is).

METRIC (locked in B.1): use `voiceFidelity()` median best-lag windowed
correlation, NOT a single global lag — native/UADE Paula drift in absolute phase
even when byte-correct. Per-voice median-corr threshold per song.

## Constraints (carried from Gate 1-2)
- Never permanently modify dirty submodules or `public/uade`; keep sha1
  cc3a153/520744b. Any oracle WASM use is read-only via `uadeRenderCore`.
- No baked schedules/tables; ports must be derived from disassembly/oracle.
- Regression per gate, in test:ci, fails-on-revert.
- Type-check (`npm run type-check`) after every change.

## Open questions to resolve during Gate A/B (not blockers)
- Does `SunTronicPlayer` need to run INSIDE the worklet (re-parse score there) or
  can it feed ticks from the main thread? (Cinter4 runs synth in-worklet — follow
  that; bundle the parser.)
- Sampled-instrument period/loop semantics vs synth — confirm from UADE DMA snap.
