---
date: 2026-09-30
topic: Master FX wet-path calibration (delays, reverbs, modulation) and dub echo engine levels
tags: [effects, master-fx, dub, levels, calibration]
status: draft
progress: see checklist
---

# Master FX wet-path calibration

Owner, 2026-09-30: "Calibrate now" (every wet stage to unity), then "do it" for
step 1 (dub echo engines) and step 2 (master FX delays / reverbs / modulation).

## Measurement
`measure_master_effect` (new MCP tool): stereo centre pink noise into the
master effects input, energy of both channels, the effect's own output
(`effectDb`) and after its post compensation gain (`chainDb`). Run over the
"Reverb & Delay" and "Modulation" groups at defaults, wet 100 %:
`npx tsx tools/master-fx-wet-calibration.ts` -> tools/master-fx-wet-calibration.json.
The old audit (get_audio_level) read a mono downmix after the master volume and
included the post gains being calibrated.

## Decisions
- The level goes in the WET path (a gain after the dry/wet mix moves the dry
  signal too). One table `WET_PATH_GAIN_DB` in effectGainCompensation.ts; the
  effect factory applies it to every effect it builds (master, instrument, DJ):
  Tone.Effect built-ins through `effectReturn`, wrappers through
  `setWetPathGain(g)`. The dub bus builds its own engines and keeps its own
  calibration (its parameters differ from the master defaults).
- Target: effectDb 0 at defaults, wet 100 %. Tolerance +-1 dB (no entry).
- Exempt: Tremolo, AutoPanner, Pulsator - amplitude / pan modulators whose peaks
  already equal the input; the lower average is the effect.
- The post-effect compensation entries of every type in the two groups are
  removed. Buzz machines (FSMChorus, FSMChorus2, FSMPanzerDelay) have no app
  wet path (the app's wet % is ignored), so their level stays a post gain.
- Master FX presets carry make-up gains measured on the old levels: re-measure
  (tools/fx-preset-audit.ts --phase 2) only the presets that contain a changed
  effect. Effect default parameters do not change.

## Checklist
- [x] C1 dub bus input restore after an engine swap (c57f6341a)
- [x] C2 RE-Tape Echo runaway on the bus (cb3d30946)
- [x] C3 measure_master_effect MCP tool + resumable run tool
- [x] C4 measured 52 effects
- [x] C5 WET_PATH_GAIN_DB table + factory application + setWetPathGain on wrappers
- [x] C6 post compensation entries for the two groups removed; buzz posts set
- [x] C7 contract test: every table type reaches a wet-path setter; test:ci
- [x] C8 re-measured live: every calibrated effect within 0.5 dB; Tone feedback delays needed the gain AFTER effectReturn (their loop feeds from it)
- [x] C9 dub bus echo engines matched to Space Echo (the default, owner-approved level) on their wet path; live within 1.5 dB at 0.3
- [ ] C10 presets containing changed effects re-measured
