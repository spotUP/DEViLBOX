---
date: 2026-11-05
topic: Octave audit, first fix batch landed
status: in progress
---

# Octave audit: first fix batch landed

## Done (pushed to main)
- bbaeea91d Tony Williams tagged 'MOD' (Amiga-period format).
- 7a93d42ec Synthesis tagged 'MOD'.
- cb8ebf8ba STP grid = byte - 11 via stpPitch.ts / periodNotes.ts.
- 0769e90ec Sound Factory grid names audible pitch (soundFactoryPitch.ts, ports sf_calc_period); exporter cuts looped samples at loop end.
- 0964d4fe6 walkPack.ts carries Future Player `ret` through the worker (fixed importWalksRunInWorker for imploder_drums.fp, hybris.fp).
- 72ac172e6 Music Assembler tagged 'MOD'.
- f48e38ded David Whittaker grid + keys name audible pitch (davidWhittakerPitch.ts; C dw_preview_key picks byte from module period table, fine_tune_period, scan_transpose). Shared keyboardPreviewHarness fundamentalHz no longer takes the half period. Push of this commit: check `git ls-remote origin refs/heads/main` == f48e38ded.

## Open
- Owner LOCAL tests (http://localhost:5174): see thoughts/spot/todos.md "OCT-AUDIT queue" rows; DW steps in thoughts/spot/2026-11-04-octave-audit.md "David Whittaker fix status".
- Remaining audit suspects: UNIC, Sonic Arranger, InStereo1, Fred, Actionamics, then the no-histogram list (audit file).
- DW follow-ups: DavidWhittakerEncoder.ts (UADE path) untouched; scan_transpose may differ per subsong; first-tick naming when sample + channel transpose combine or global transpose non-zero.
- Sound Factory: 9 goldrunner notes past the 72-note period table are silent on keyboard preview; pcm8ToWAV upsampled (<8000 Hz) samples still exported upsampled (unchecked).
- exporterRoundtripRegressions "MOD export round-trips" needs ~35 s, over the 30 s default; flaky under load.

## Read first
- thoughts/spot/2026-11-04-octave-audit.md (suspects table + per-format measured / fix status sections)
- thoughts/spot/todos.md section "## OCT-AUDIT queue (2026-11-04)"
- Skill format-pitch-octave.
