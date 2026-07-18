---
date: 2026-07-05
topic: sonix-first-class-editable
tags: [sonix, handoff]
status: in-progress
---

# Handoff — Sonix first-class editable + C-port accuracy

## Tasks
Make Sonix a first-class editable format (synth + editable patterns) and get it playing.

## Done + committed (working)
- Sonix loads + plays from disk, modland, AND drag-drop (song + Instruments/ folder). Key
  fixes this session (all committed): companion-loss in the import-confirmation dialog
  (`e61ecf26b` — THE silent-drag-drop bug), prefix-form detection, `.instr/.ss` as
  companions-only, modland Instruments/ discovery (`/api/modland/list`), 429 fix, worklet
  memfs + TextEncoder, sidecarFiles store round-trip, dedicated vite port 5174.
- First-class editable scaffold (`dc807e4d8`): WASM synth param get/set API (P2),
  worklet param readback→engine→store bridge (P3), SonixSynth voice + registry (P4),
  SonixControls editor (P5), editor-mode dispatch (P6). Editor SHOWS for synth instruments.

## Open bugs (next session)
1. **C-port renders inaccurately — RESOLVED (Paula DAC scale).** Lock-step measurement
   disproved the short-loop hypothesis: LEN/PER/VOL registers all match UADE. Root cause was
   per-channel output scale — C port summed 4 channels each at full-scale 1.0 -> ~4.0 -> clip
   (native harness peak 1.95 pre-fix). Fix: `s *= vol * 0.25f` in `snx_mix_frames`
   (Paula DAC: `sample*vol/32768`, single channel max 0.248). WASM rebuilt + copied to
   `public/sonix/`. Regression `npm run test:sonix`. Full write-up in the research doc
   (status: implemented). Remaining finer item: linear-vs-BLEP interpolation crest gap
   (corr 0.80) — separate, not a scale/register bug. **In-browser MCP validation still
   pending** (no browser connected this session; headless-validated only).
2. **Editor knobs no-op — RESOLVED (commit 710d0fe4e).** Root cause: `updateInstrument`
   had no dispatch branch for synthType 'SonixSynth', so knob edits fell through to the
   invalidation path (invalidate + replayer map update) and never called
   `SonixSynth.applyConfig → SonixEngine.setSynthParams`. Added a branch mirroring
   Cinter4/Hively (`engine.getInstrument` → `applyConfig`, no invalidate). Regression in
   `src/stores/__tests__/sonixSynthLiveEdit.test.ts` (in test:ci; fails pre-fix). Note: the
   param bridge tags instruments as SonixSynth on **play** (loadTune fires onSynthParams),
   not on load — the editor is empty until the song has played once. Live audible-delta not
   directly driven via MCP (store not on window); routing is unit-test-proven + worklet path
   confirmed (reads params.index, calls all WASM setters).
3. **P7 not done:** save edited synth params back to native .instr (round-trip).
4. Faithful per-note audition (render-one-note WASM export) — voice preview is base-waveform only.

## Key refs
- C port: `sonix-wasm/src/sonix/sonix.c`, `sonix_io.c`. Rebuild: `cd sonix-wasm/build && emmake make` → cp to `public/sonix/`.
- Worklet: `public/sonix/Sonix.worklet.js` (memfs, param read/write, workletCacheBust).
- Test song: `public/data/songs/sonix/games/Spot - The Computer Game!/smus.wait2` (5 synth + 4 sample). Native probe pattern in session /tmp/wav.c.
- Memory: `project_sonix_engine_routing.md`.

## Notes
- Test at localhost:**5174** (maker app holds 5173).
- Native/headless (shipped WASM + memfs) both render smus.wait2 at PEAK ~1.0 — the C port
  IS the current sound; use it as the "wrong" side of the A/B (`/tmp/sonix_out.wav` vs
  `/tmp/uade_ref.wav`).
- Rule reminder (new 2026-07-05): analyse-first / measure before coding; no `--no-verify`
  (commit in background so pre-commit test:ci completes).
