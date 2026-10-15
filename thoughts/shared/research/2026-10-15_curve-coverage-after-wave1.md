---
date: 2026-10-15
topic: Curve and live-marker coverage of the DOMSynthPanel layouts after rollout wave 1 and group 6
tags: [synth-ui, curves, audit, domsynthpanel, voice-state]
status: final
---

# Curve coverage after wave 1 and group 6

Audit task of the group 6 brief. Documentary, plus the recommendation at the end.

## Method (what was counted, and from where)

- Registry: `SYNTH_LAYOUTS` (`src/constants/synthLayouts/index.ts`): 141 synth types, 68 distinct layout objects (76 of the keys are the
  five Furnace layouts). Counted by loading the registry and grouping keys by object identity.
- "Reaches DOMSynthPanel": taken from the census (`2026-10-15_synth-curve-census.md` section 1, which executed `getEditorMode` over the
  141 keys and read `SynthControlsRouter`): 49 synth types / 47 layouts. A = main editor (`SynthTypeDispatcher` layout mode, plus the DX7
  and Klystrack hosts), B = tracker inline controls (`SynthControlsRouter` generic fallthrough). Not re-derived here.
- Curves and markers: counted at runtime on the registered layout objects, over `sections[]` plus `tabs[].sections[]`:
  `curves` = number of `CurveDescriptor`s, `marked` = how many of them carry a `marker`. Waveform and spectrum curves have no live marker by
  nature (the voice is not at a point on them), so a fully done layout shows marked < curves.
- Klystrack: its static registry entry carries no marked curves because `KlysControls` builds the layout per instrument with the
  engine context (`klystrack.ts:106-161`); its markers are real (envelope, filter, vibrato, PWM).
- Engine kind and effort are judgement: S = TypeScript only (Tone.js or in-thread), no rebuild; M = one voice-report getter in C/C++
  plus a rebuild, or a larger model on an engine whose voice state is readable; L = no readable voice state (emulation, ROM), a very large
  engine, or a layout DOMSynthPanel does not host.

## Reachable layouts (47)

| Layout (synth types) | Reach | Controls | Curves | Marked | Engine kind | Effort to finish |
|---|---|---|---|---|---|---|
| KlysSynth | A,B | 64 | 5 | 4 (built per instrument) | native WASM tracker synth | done |
| Synth, MonoSynth, DuoSynth, FMSynth, ToneAM | A,B | 20-27 | 3-4 each | 3-4 | Tone.js voices | done |
| MetalSynth, MembraneSynth, NoiseSynth | A,B | 6-9 | 1 each | 1 each | Tone.js | done |
| PWMSynth, SuperSaw, PolySynth, StringMachine, FormantSynth, ChipSynth, Wavetable | A,B | 8-19 | 1-3 each | all | Tone.js (PolySynth family) / native Web Audio | done |
| OPL3 | B (A: OPL3Controls) | 26 | 9 | 6 | WASM emulator (Nuked) | done |
| DX7 | A,B | 146 | 23 | 15 | WASM (Dexed firmware) | done |
| OidosSynth | B | 18 | 4 | 3 | WASM demoscene | done |
| TunefishSynth | B | 50 | 4 | 4 | WASM demoscene | done |
| WaveSabreSlaughter, WaveSabreFalcon (+WaveSabreSynth) | A,B | 20 | 4 / 3 | 3 / 2 | WASM demoscene | done |
| MdaJX10 | A | 24 | 6 | 5 | WASM (MDA) | done |
| Amsynth | A | 41 | 5 | 4 | WASM | done |
| RaffoSynth | A | 32 | 4 | 3 | WASM | done |
| CalfMono | A | 52 | 4 | 4 | WASM | done |
| SynthV1 | A | 100 | 12 (6 per page) | 8 | WASM, two synth pages per voice | done (group 6) |
| TalNoizeMaker | A | 77 | 8 | 6 | WASM | done (group 6) |
| ZynAddSubFX | A | 63 | 7 | 3 | WASM, huge engine | done for the ADD part and the global filter (group 6); SUB, PAD, LFO not in the layout |
| PluckSynth | A,B | 6 | 0 | 0 | Tone.js | S |
| Organ | A,B | 16 | 0 | 0 | Tone.js, drawbar additive | S (drawbar spectrum, no markers) |
| DrumMachine | A,B | 19 | 0 | 0 | Tone.js percussion voices | M (several voice classes) |
| Sampler, Player (one layout) | B | 6 | 0 | 0 | Tone.Sampler / Player | S (envelope only) |
| GranularSynth | B | 17 | 0 | 0 | Tone.GrainPlayer | M (grain window, position) |
| DrumKit | B | 2 | 0 | 0 | sample playback | S, low value |
| OpenWurli | A,B | 5 | 0 | 0 | WASM physical model | M, low value (tremolo only) |
| MdaEPiano | A | 12 | 0 | 0 | WASM (MDA) | M (shares the MDA bridge with JX10) |
| MdaDX10 | A | 16 | 0 | 0 | WASM (MDA) | M (shares the MDA bridge with JX10) |
| SetBfree | A | 53 | 0 | 0 | WASM tonewheel organ | M (drawbar spectrum, vibrato scanner) |
| Aeolus | A | 35 | 0 | 0 | WASM pipe organ | L, little to draw |
| FluidSynth | A | 15 | 0 | 0 | WASM sample player | S-M; low value |
| CZ101 | B | 11 | 0 | 0 | custom WASM (upd933 chip port, envelopes in the engine) | M |
| D50 | A,B | 9 | 0 | 0 | MAME RolandSA, no voice report | L |
| MAMETR707, TR808, TR909 | B / A,B | 13 / 23 / 28 | 0 | 0 | MAME (707), TS/WASM drum voices | M-L; decay envelopes only |
| C64SID | A,B | 2 | 0 | 0 | playback engine | not worth it (2 controls) |

Totals, counted at runtime over the 49 reachable synth types: 30 draw curves, 30 carry markers (29 on the static layout, plus KlysSynth, whose
markers are built per instrument), 19 have none: Aeolus, C64SID, CZ101, D50, DrumKit, DrumMachine, FluidSynth, GranularSynth, MAMETR707,
MdaDX10, MdaEPiano, OpenWurli, Organ, Player, PluckSynth, Sampler, SetBfree, TR808, TR909.

## Registered but never rendered by DOMSynthPanel (21 layouts)

Odin2, Surge, Vital, V2, V2Speech, DubSiren, HarmonicSynth, SpaceLaser, WobbleBass, Synare, Monique, VL1, Sfizz, PinkTrombone, DECtalk,
Sam, and the 5 Furnace layouts (76 keys). They have 0 curves and could not show any without a layout host or a CurvePanel inside their
bespoke editor. Highest curve-able share among them (census): V2 94 percent, WobbleBass 91 percent, Monique 86 percent.

## Recommendation: next three groups

Ranked by usage proxy (default palette, format-native) x curve-able share, engine cost as the tie-break, as in the census.

1. **Tone leftovers: Organ, PluckSynth, DrumMachine, Sampler/Player** (S to M, no rebuild). All Tone.js or in-thread, so the existing
   voice probe and `toneCurves.ts` models apply; DrumMachine is the biggest (19 controls, several voice classes) and the one a song
   author uses most. Closes the default palette.
2. **MDA family: MdaDX10 and MdaEPiano** (M, one bridge). `MdaJX10` already carries the voice report; the other two MDA engines share the
   plugin base, so one C++ getter pattern and one rebuild each. DX10 is a 2-operator FM with envelopes and LFO (16 controls, the census
   put its curve-able share at 38 percent); EPiano is a modal piano with tremolo (42 percent).
3. **CZ101** (M). Format-native (patches arrive from the CZ SysEx packs shipped in `public/data/sysex/cz-pack-1`), its envelopes live in
   our own engine (`upd933_env_reset`, per-voice DCA/DCW/DCO state), so a voice report is a getter, not an emulator probe. D50 and the
   TR drum machines (MAME) stay L until an emulator-state path exists.

Decision for the owner, not taken here: the unreachable high-share layouts (V2, WobbleBass, Monique, Odin2/Surge/Vital) need either a
layout host or a `CurvePanel` inside their bespoke editors before any curve work counts for them.

## Appendix: group 6 findings that are listed, not fixed

Keys the engine ignores (no curve drawn, listed per the brief):

- SynthV1: `dcf1KeyFollow`, `dcf2KeyFollow` (no engine parameter; there is no key follow), `dcf1Velocity`, `dcf2Velocity`, `dca1Velocity`,
  `dca2Velocity` (no engine parameter). `dco1Velocity` is the shared velocity curve (DEF_VELOCITY), not an oscillator setting.
  `dco1Sync` writes only SYNC1; the Formant filter slope (3) and Biquad (2) are engine slopes the layout does not offer.
  `delayBpm` is 0..1 in the layout and the engine parameter is a tempo in BPM (0..360): the delay time is wrong the same way the LFO rate was.
- TAL-NoiseMaker: `portamentoMode` (two options in the layout, three items in the engine, names unverified), the pitch wheel and
  velocity controls (curves assume full velocity and no wheel), the state variable filter types (response not drawn), the Random Step and
  Noise LFO shapes (random).
- ZynAddSubFX: the filter envelope SUS knob (`filterSustain`: ADSR_filter has a fixed centre sustain), `filterVelocity` is applied but only
  as a cutoff shift, Peak / Low Shelf / High Shelf filter types (no gain control in the editor, they are flat and are no longer offered),
  the SUB and PAD synth spectra and every LFO (none in the layout).
- Hand-written TAL presets (`TAL_NOIZEMAKER_PRESETS`, 18) use raw 1.0 for "saw" in `osc1Waveform` / `osc2Waveform`; the engine's scale is
  normalised, so 1.0 is Noise. Not rewritten here (their intent for `filterType`, `lfo1Destination` is also on the old scale).
- `AeolusSynth`, `SfizzSynth`, `FluidSynthSynth` `applyConfig` ignore non-number values, which drops a layout select's string value the
  way TAL-NoiseMaker and ZynAddSubFX did before this change. Not checked per select.
