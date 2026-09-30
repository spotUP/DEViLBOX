---
date: 2026-09-30
topic: Master FX wet-path calibration (delays, reverbs, modulation) and dub echo engine levels
tags: [effects, master-fx, dub, levels, calibration]
status: implemented
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
- [x] C10 90 presets re-measured (stereo pink noise, -18 dBFS); 80 make-ups written, 5 spot-checked at 0.0 +-0.1 dB with make-up. Kept: 9 Neural presets (amp models 6-18 dB off unity alone - per-model neural calibration first) and RE-201 Runaway (self-oscillates by design)

## C10 notes (2026-09-30)
- tools/fx-preset-audit.ts is not fit for time-based presets: five steady sines
  through get_audio_level; a sine interferes with its own delayed copy (Hall
  Reverb read -4.1 dB after its +3.2 dB make-up). Replaced for this job by
  tools/master-fx-preset-calibration.ts (measure_master_effect with the whole
  chain, stereo pink noise). Run: `--containing <each changed type>`, check,
  then `--write`.
- Two audit runs lost the browser around the VHS Tape preset
  (BitCrusher+Vibrato+Filter): run 1 read silent from VHS Tape on, run 2
  measured VHS Tape then lost the browser at the next call. Cause unconfirmed
  (crash or a manual reload); nothing in the app reloads by itself and the
  Vite dep cache did not change. The owner's master chain before the run was
  held only in the audit's memory and is lost; the tab came back with VHS Tape,
  cleared to empty.

## Open (owner reports, 2026-09-30 afternoon)
- [ ] O1 Generated dub moves inaudible after the bus reset to defaults:
      snareCrack, radio, siren ("a crack was fired inaudible", "silent siren
      fired"). They are sized by generatedPeak() from the programme level
      (AudioDataBus rms/peak). Bus gains read sane (input 1, return 0.85).
      Next: measure with measure_dub_echo_response {move} while playing.
- [ ] O2 "Modern Glue & Air" very low volume. Make-up -7.7 dB predates today
      (not in the 2026-09-30 re-measure); chain ends in a Maximizer (ceiling
      device) - a cut after a ceiling is the suspect. Measure on music.
- [ ] O3 "*Wave Landscape" (ShimmerReverb + AmbientDelay) sounds metallic.
- [ ] O4 BadCat Jazz reported silent - not reproduced (plays +8 dB on the
      Hively song, also after fast preset switching). Need the owner's steps.
- [x] O5 "siren never stops": measure_dub_echo_response {move: dubSiren} fired the
      held move and dropped its release. Released live; the tool now disposes it.
- O1 finding: on the playing song the moves are sized to the programme
      (generatedPeak = presence x programme peak: crack 0.13 vs peak 0.26) and
      land at the song sends' level on the return (-15..-18 dBFS). The bus
      reset took echoWet 0.9 -> 0.5 (-5 dB on every move's echo tail).
- [ ] O6 RE-201 on the bus self-oscillates, "gets stronger and stronger": mode 9
      (Tubby, set today) sums three heads into the feedback - loop gain ~1.6 at
      intensity 0.62. Fix: RE201Adapter shares the bus intensity over the heads.
- [ ] O7 "Big Room" preset (MVerb+StereoWidener+Compressor+EQ3) does not sound
      like a big room - broken?
- [ ] O8 "Cosmic" preset (FrequencyShifter+PingPongDelay+Reverb) sounds very dirty.
- [ ] O9 Vinyl-related master FX (VinylNoise, ToneArm, Vinyl, Cassette/VHS/Lo-Fi
      presets): hiss, pops, crackle and wet far too low - the vinyl character is
      not audible.
- [ ] O10 "Big Muff Doom" sounds stuck in a jar, muffled (Neural Big Muff V6 +
      EQ3 + Reverb). Check after today's skip-connection fix: the model's own
      tone vs the preset's EQ3/tone settings.
- [ ] O11 "Vox Amp Crunch" low volume, very thin, all bass gone. DIAGNOSED: the
      preset runs WAMVoxAmp at wet 40 and its -13.9 dB post compensation sits
      AFTER the dry/wet mix, so the 60 % dry is cut 13.9 dB too - what is left
      is mostly the thin amp. Same class as the time-based fix: every drive /
      amp / EQ entry in EFFECT_GAIN_COMPENSATION_DB is a wet-100 % calibration
      applied to dry + wet. Fix: in MasterEffectsChain put the compensation on
      the effect's wet path when it has one (reuse applyWetPathGain as a
      generic applyWetGain(node, gain)); post gain only for effects with no
      wet path (buzz machines). Master chain only, as today's post gains are.
      Then re-measure presets containing those types. Needs the owner's pause:
      editing these modules reloads the page.
- [ ] O12 "Aelapse Dub" sounds raw - Aelapse not working? (wet-path gain +1.9 dB
      added today; check the effect is actually processing).
- [ ] O13 Jeskola (Buzz) synths: do not sound on the first key press; many have no
      presets; all use an odd custom preset selector (should be the design-system
      CustomSelect).
