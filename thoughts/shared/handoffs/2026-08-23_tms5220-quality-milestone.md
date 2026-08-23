---
date: 2026-08-23
topic: TMS5220 speech quality milestone — review, quality plan, live-fix session
tags: [tms5220, speech, tts, espeak, review]
status: final
---

# TMS5220 quality milestone (user sign-off: "sounds good enough now")

One day, ~20 commits, main a72109d01 -> 88c8573b5, all pushed and deployed.

## What happened, in order

1. **Review of Thu-Sun commits** found main had NOT built since Aug 21 (three
   modules imported but never committed) — six red deploys, site serving
   Aug 19 code. Fixed, plus: mined phoneme library was dead code (static
   table shadowed it — decided by new leave-one-out holdout tool, 124/128),
   Cabinet knob on the wrong chip, phoneme-notation sniffing replaced by
   [bracket] marking.
2. **Quality plan** (thoughts/shared/plans/2026-08-23-tms5220-phoneme-quality.md):
   real stop-closure silence through all layers, espeak-ng revived (bundle
   had been broken since MARCH — stripped data dropped lang/), segment-
   relative pitch contour, phrase-final lengthening. Unit selection measured
   and REJECTED (worse than medoid on holdout).
3. **Live listening loop with the user**: stops mined from word medoids not
   letter cuts ("pweeter" fix), presets un-inverted (pitch_index = PERIOD
   table!), speech brightness tilt added to the wasm (K-offsets garble
   vowels — never use them for tone), Speak & Spell preset, MINED_TEMPO 0.7
   (slow-motion fix), pitch micro-melody smoothed + clamped ±1 (nervous-
   sliding fix), session-restore freeze fixed (mining memoized + idle,
   espeak from public/ with repack tag).

## Key artifacts

- tools/tms5220-audit/holdoutReconstruction.ts — THE oracle. Both in-tree
  oracles are circular; use this for any phoneme-source decision.
- tools/espeak-repack.mjs — rebuilds public/espeak-ng.{js,data} from the
  pristine npm package. lang/ tree is REQUIRED.
- ~25 new tests wired into test:ci (each verified fail-before/pass-after).

## Open (small)

- MSM5232 + TIA: picker entries with no engine — wire or remove, user's call.
- backup-2026-08-20-tms5220 branch: content in main, deletion needs approval.
- Detail in memory: project_tms5220_speech_quality.md
