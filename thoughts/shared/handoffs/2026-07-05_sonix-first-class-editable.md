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
1. **C-port renders inaccurately** (chosen: full lock-step). Symptoms: ~3x loud, short-loop
   timbre. Research + reference captured: `thoughts/shared/research/2026-07-05_sonix-cport-accuracy-lockstep.md`.
   UADE reference decoded (`tools/sonix-audit/decode-uade-paula.mjs`); ch0 LEN up to 720
   words, VOL<=47. NEXT: instrument `sonix.c` per-tick per-channel {period, active_pcm_len,
   loop_len, hw_vol}, diff vs the UADE timeline, fix at the first-diverging register's level.
   Regenerate dump: `uade123 -1 -w 8 --frequency 48000 --write-audio /tmp/sonix_paula.dump "<song>"`.
2. **Editor knobs no-op** — SonixControls shows but turning a knob has no audible effect.
   Trace `SonixControls.handleChange → updateInstrument → SonixSynth.applyConfig →
   SonixEngine.setSynthParams → worklet applySynthParams → WASM setters` during song
   playback. Likely the playing WASM song only re-reads scalar params on the next note, or
   no live SonixSynth voice exists for the suppressNotes engine so applyConfig never fires.
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
