---
date: 2026-08-23
topic: TMS5220 synthesized-phoneme quality — make non-ROM words sound awesome
tags: [tms5220, speech, tts, phonemes, prosody]
status: implemented
---

# TMS5220 phoneme quality plan

Baseline (2026-08-23, after c82b6abef): mined ROM runs are primary, static
table fallback, per-word pitch declination, SAM-rules G2P. Holdout oracle:
128 held-out words, library mean DTW 0.1253 vs static 0.1706 (124/128).

User verdict: "sounds a lot better already" — now maximize.

## What limits quality today (measured, not guessed)

1. **No real silence.** `packFrameBuffer` clamps energy to [1,14], and
   `lpcToTMS5220Frames` filters energy-0 frames out during mining. Stops
   (P/T/K/B/D/G) are DEFINED by closure silence + burst; ours are mushy
   because closure is impossible at two layers. The MAME core handles
   energy-0 frames correctly (old_silence/new_silence interpolation inhibit
   at TMS5220Synth.cpp:978) — only the JS layers forbid it.
2. **G2P is 1980s SAM rules.** espeak-ng is bundled, patched
   (scripts/patch-espeak.sh), has an IPA→SAM mapping (EspeakNG.ts), and an
   async entry point `textToTokens` — used by VLM5030 only. The TMS5220
   chain uses sync SAM rules. Wrong phonemes can't sound right.
3. **Pitch jumps at segment joins.** Each mined run keeps its source
   recording's absolute pitch (one word mined at index 20, neighbor at 8).
   Per-word offsets shift whole words; nothing smooths across segment
   boundaries inside a word.
4. **One exemplar per code.** `extractWordPhonemeLibrary` returns a
   candidates map (often 5-20 per code); `pickMedoid` keeps one and the
   rest are discarded. Join quality varies wildly by context — unit
   selection with a join cost is the standard fix.
5. **Flat rhythm.** Stress→duration exists; phrase-final lengthening and
   pre-pausal lengthening do not.

## Oracle

`tools/tms5220-audit/holdoutReconstruction.ts` — leave-one-out DTW against
real recordings. Segmental changes must not regress mean/win-rate.
Prosody/pitch changes are invisible to the DTW metric (frameLikeDistance
excludes pitch) — those are gated by unit tests on contour shape + ear.
Listening set: render fixed phrases to WAV before/after each phase via
tools/tms5220-audit/renderPhrase.ts.

## Checklist

- [x] Q0 Record baseline: holdout numbers + listening WAVs (before)
- [x] Q1 Real silence (2a57ec389): packer allows energy 0; mining keeps stop closures;
      synthesis inserts closure before bursts; tests fail on old packer
- [x] Q2 espeak-ng G2P (2ace8ace1) primary for TMS5220 typed text (SAM fallback,
      brackets stay literal); preload on synth init; routing tests
- [x] Q3 Utterance pitch contour (dae1df13b; jumps 13->6, 9->4): declination + stress accents + final
      fall/question rise, applied segment-relative so micro-prosody
      survives; join discontinuity bounded; tests on shape + joins
- [x] Q4 Unit selection — MEASURED AND REJECTED. Viterbi over top-5
      candidates (join cost + alignment cost): holdout 0.1490 vs medoid
      0.1359, better on 33/128. With typicality as target cost it converges
      to always-medoid (0/128 changed). The candidate pool inside
      CLUSTER_TOLERANCE is too homogeneous for selection to add anything the
      DTW oracle can see. Reverted per this plan's gate; do not re-attempt
      without a materially larger candidate pool (more ROMs).
- [x] Q5 Duration rules (3f7c93fa7; holdout 0.1359->0.1348): phrase-final + pre-pausal lengthening; test that a
      final vowel outlasts the same vowel mid-utterance
- [x] Q6 Regenerated tms5220Phonemes (54 codes, 327 frames, closures+silence); lexicon NOT regenerated (tiers unchanged — coverage identical),
      full holdout table (baseline vs cumulative), listening WAVs (after),
      type-check + test:ci + push

## Final numbers

Holdout (128 held-out words, DTW vs real recordings; target keeps interior
silence from Q1 on):
- static-only:            0.1766
- library baseline:       0.1359
- after final lengthening: 0.1348 (124/128 closer than static)
- unit selection (Q4):     0.1490 — rejected and reverted

Pitch-join discontinuity (max voiced jump): COMPUTER MONSTER THURSDAY 13->6,
HELLO WORLD 9->4, SPELL EXPERIMENT 5->4.

Listening sets: scratchpad listen/before, listen/q1, listen/after
(session-local; re-render with tools/tms5220-audit/renderPhrase.ts).

Execution notes:
- Every new behavior gets a test wired into test:ci; ROM-dependent tests
  skipIf-guarded (CI has no VSM).
- Each fix verified fail-before/pass-after by reverting the change.
- ROM words and imported recordings stay byte-exact — all changes are in
  the synthesized-phoneme path only.
