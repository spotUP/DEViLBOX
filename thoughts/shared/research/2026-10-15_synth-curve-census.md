---
date: 2026-10-15
topic: Synth curve census - which DOMSynthPanel layouts can carry curves, and which engines can report voice state
tags: [synth-ui, curves, census, domsynthpanel, voice-state]
status: final
---

# Synth curve census (CV-0 of 2026-10-15-synth-ui-realtime-curves.md)

Documentary. Classification of controls is by key/label regex, run over the loaded registry
(heuristic, see "Method and limits"); every voice-state answer cites the file:line looked at.

## 1. Counts (CV-0.1)

Counted from the registry builder `SYNTH_LAYOUTS` (`src/constants/synthLayouts/index.ts:68`, a literal object),
loaded at runtime with tsx and measured by identity:

| What | Count | Counted from |
|---|---|---|
| Registry keys (synth types) | 141 | `Object.keys(SYNTH_LAYOUTS)` |
| Distinct layout objects | 68 | `Map` keyed by object identity (Furnace: 71 keys share `FURNACE_LAYOUT`; `WaveSabreSynth` shares `FALCON_LAYOUT`; `Sampler`/`Player` share `SAMPLER_LAYOUT`) |
| Exported `*_LAYOUT` constants in the folder | 68 | `grep "^export const .*_LAYOUT"` = 69 hits, minus `SYNTH_LAYOUTS` itself; set equals the 68 registered (`comm` of the two name lists is empty) |
| Files in folder | 57 | `ls | wc -l` = 56 layout files + `index.ts` (toneSynths.ts holds 9 layouts, furnace.ts holds 5) |

The plan's "57 layouts" is the file count; the real count is 68 layouts for 141 synth types.

### Which of them DOMSynthPanel actually renders

`DOMSynthPanel` has exactly four importers (`grep -rln DOMSynthPanel src`): `SynthTypeDispatcher.tsx`,
`SynthControlsRouter.tsx`, `KlysControls.tsx` (+ its own file and the sizing helper). Two host paths:

A. Main editor (`UnifiedInstrumentEditor.getEditorMode` line 148, then `SynthTypeDispatcher`): DOMSynthPanel is
   rendered in three branches only: `editorMode === 'layout'` (Dispatcher:3900-3921), the DX7 branch under the
   `DX7Controls` (Dispatcher:2712-2717), and `KlysControls` (Dispatcher:1642, KlysControls.tsx:108). The `vstbridge`
   branch (Dispatcher:3656-3671) also calls it, but no layout key resolves to `vstbridge`
   (the 9 registered ids are Vital, Odin2, Surge, TonewheelOrgan, Melodica, Monique, Helm, Sorcer, OBXf and the first
   three/Monique are caught by earlier modes).
   `getEditorMode` extracted and executed over the 141 keys: 37 types resolve to `layout`
   (OpenWurli, WaveSabreSlaughter, WaveSabreFalcon, ChipSynth, SuperSaw, PolySynth, Organ, PWMSynth, StringMachine,
   FormantSynth, Wavetable, DrumMachine, Synth, MonoSynth, DuoSynth, FMSynth, ToneAM, PluckSynth, MetalSynth,
   MembraneSynth, NoiseSynth, MdaEPiano, MdaJX10, MdaDX10, Amsynth, RaffoSynth, CalfMono, SetBfree, SynthV1,
   TalNoizeMaker, Aeolus, FluidSynth, ZynAddSubFX, D50, TR808, TR909, C64SID), plus DX7 and KlysSynth = 39 types.
B. Tracker inline controls (`SynthControlsRouter.tsx:595-607`): the generic fallthrough after ~60 explicit
   branches. Layout keys not matched by an explicit branch and not Furnace/Buzz: 36 types (OpenWurli, OPL3, DX7,
   Oidos, Tunefish, WaveSabre x3, ChipSynth, Sampler, Player, Granular, DrumKit, SuperSaw, PolySynth, Organ, PWMSynth,
   StringMachine, FormantSynth, Wavetable, DrumMachine, Synth, MonoSynth, DuoSynth, FMSynth, Pluck/Metal/Membrane/Noise,
   CZ101, D50, MAMETR707, TR808, TR909, KlysSynth, C64SID).

Union of A and B = 49 synth types (47 distinct layouts). NOT rendered by DOMSynthPanel anywhere (bespoke editor wins):
Odin2, Surge, Vital, V2, V2Speech, DubSiren, HarmonicSynth, SpaceLaser, WobbleBass, Synare, Monique, VL1, Sfizz,
PinkTrombone, DECtalk, Sam = 16 types / 16 layouts, plus all 76 Furnace keys / 5 layouts (Furnace uses
`FurnaceControls`, Dispatcher:773; Router:590). So 21 of the 68 layouts are registered but unreachable through
DOMSynthPanel. Cross-check of the arithmetic: 141 - 76 Furnace - 16 = 49; 47 + 16 + 5 = 68.

Unverified: the router's earlier branches (lines < 255) were not read; the 36-type list assumes no early branch
captures a layout type (the first branch, WobbleBass at Router:265, is the first `synthType ===` match).

## 2. Method and limits (CV-0.2)

Controls come from each layout's `sections[]` plus `tabs[].sections[]` (types in `src/types/synthPanel.ts`: knob,
toggle, slider, switch3way, select). Kind by regex on `key + label`, first match wins in the order
fm, envelope, filter, lfo, waveform, transfer, other. Limits: DX7 (`vced.N` keys, labels R1..L4) and OPL3 (`op1...`)
mis-classified by the regex, so those two rows are hand-corrected below; "oscillator level" knobs are counted as
waveform; "other" is volume, pan, mix, effect sends, tuning, selects without shape meaning. Treat shares as +-10 points.

Curve kinds per plan: envelope (stage envelopes), filter, lfo, waveform (wave select, pulse width), transfer
(drive, distortion), fm (algorithm, operators), other (volume, pan, mix, tuning: not curve-able).

## 3. Per-layout census

Columns: ctrls = DOMSynthPanel controls (all tabs); cv = controls that map to a curve kind; share = cv/ctrls.
Reach: A = main editor, B = tracker router, - = not rendered by DOMSynthPanel (section 1).

### 3.1 Reachable layouts

| Layout (synth type) | configKey | Sections | ctrls | cv | share | Kinds (count) | Reach |
|---|---|---|---|---|---|---|---|
| KlysSynth | klys | tabs main + program | 64 | 37 | 58% | wave 13, env 10, lfo 7, filter 5, fm 2 | A,B |
| Synth | - | 6 | 21 | 17 | 81% | env 8, wave 3, filter 3, lfo 3 | A,B |
| MonoSynth | - | 6 | 21 | 17 | 81% | env 8, wave 3, filter 3, lfo 3 | A,B |
| DuoSynth | - | 6 | 21 | 17 | 81% | env 8, wave 3, filter 3, lfo 3 | A,B |
| FMSynth | - | 6 | 23 | 19 | 83% | env 8, wave 3, filter 3, lfo 3, fm 2 | A,B |
| ToneAM | - | 6 | 22 | 18 | 82% | env 8, wave 3, filter 3, lfo 3, fm 1 | A,B |
| PluckSynth | - | - | 6 | 3 | 50% | env 2, filter 1 | A,B |
| MetalSynth | - | - | 9 | 6 | 67% | env 3, fm 2, filter 1 | A,B |
| MembraneSynth | - | - | 7 | 4 | 57% | env 4 | A,B |
| NoiseSynth | - | - | 9 | 7 | 78% | env 4, filter 3 | A,B |
| PWMSynth | pwmSynth | - | 19 | 17 | 89% | env 9, wave 4, filter 3, lfo 1 | A,B |
| SuperSaw | superSaw | - | 17 | 13 | 76% | env 9, wave 2, filter 2 | A,B |
| PolySynth | polySynth | - | 8 | 4 | 50% | env 4 | A,B |
| Wavetable | wavetable | - | 19 | 15 | 79% | env 9, wave 3, filter 2, lfo 1 | A,B |
| StringMachine | stringMachine | - | 11 | 4 | 36% | env 2, lfo 1, filter 1 | A,B |
| FormantSynth | formantSynth | - | 13 | 10 | 77% | filter 5, env 4, lfo 1 | A,B |
| ChipSynth | chipSynth | - | 11 | 8 | 73% | env 4, lfo 4 | A,B |
| Organ | organ | - | 16 | 1 | 6% | lfo 1 | A,B |
| DrumMachine | drumMachine | - | 19 | 12 | 63% | env 6, filter 4, fm 1, xfer 1 | A,B |
| OPL3 (hand-corrected) | opl3 | tabs 3, 7 sections | 26 | 12 | 46% | env 8 (2 ops x ADSR), wave 2, fm 2 (feedback, additive); level/multi/flags are other | B (A uses OPL3Controls) |
| DX7 (hand-corrected) | dx7 | tabs 7, 22 sections | 146 | ~66 | ~45% | env 56 (6 ops + pitch EG, rate/level x4), lfo 7, fm 3 (algo, feedback, op sync) | A (below DX7Controls), B |
| OidosSynth | oidos.synth | - | 18 | 13 | 72% | env 6, filter 4, wave 1, fm 1, xfer 1 | B (A: xrns-synth) |
| TunefishSynth | tunefish | - | 50 | 28 | 56% | filter 17, wave 4, xfer 4, lfo 2, env 1 | B |
| WaveSabreSlaughter | wavesabre.slaughter | - | 20 | 16 | 80% | env 9, wave 3, filter 3, xfer 1 | A,B |
| WaveSabreFalcon (+WaveSabreSynth) | wavesabre.falcon | - | 22 | 18 | 82% | env 8, wave 7, fm 2, xfer 1 | A,B |
| MdaEPiano | mdaEPiano | - | 12 | 5 | 42% | env 2, lfo 1, wave 1, xfer 1 | A |
| MdaJX10 | mdaJX10 | - | 24 | 19 | 79% | filter 8, env 5, wave 3, lfo 3 | A |
| MdaDX10 | mdaDX10 | - | 16 | 6 | 38% | env 3, lfo 2, wave 1 | A |
| Amsynth | amsynth | - | 41 | 31 | 76% | wave 12, env 9, filter 7, lfo 2, xfer 1 | A |
| RaffoSynth | raffo | - | 32 | 18 | 56% | wave 8, env 8, filter 2 | A |
| CalfMono | calfMono | - | 52 | 37 | 71% | env 16, lfo 9, wave 6, filter 6 | A |
| SetBfree | setbfree | - | 53 | 10 | 19% | lfo 4, xfer 3, env 1, wave 1, filter 1 (drawbars are other) | A |
| SynthV1 | synthv1 | - | 100 | 56 | 56% | env 18, lfo 16, wave 10, filter 8, fm 4 | A |
| TalNoizeMaker | talNoizeMaker | - | 77 | 49 | 64% | wave 16, lfo 14, env 11, filter 7, fm 1 | A |
| ZynAddSubFX | zynaddsubfx | - | 63 | 39 | 62% | wave 18, env 9, filter 9, xfer 2, lfo 1 | A |
| Aeolus | aeolus | - | 35 | 1 | 3% | lfo 1 (stops are other) | A |
| FluidSynth | fluidsynth | - | 15 | 3 | 20% | - | A |
| CZ101 | parameters | - | 11 | 5 | 45% | wave 2, lfo 3 | B (A: mamechip) |
| D50 | parameters | - | 9 | 4 | 44% | wave 2, filter 2 | A,B |
| TR808 | parameters | - | 23 | 6 | 26% | filter 3, env 3 | A,B |
| TR909 | - | - | 28 | 9 | 32% | env 8, filter 1 | A,B |
| MAMETR707 | parameters | - | 13 | 1 | 8% | env 1 | B |
| OpenWurli | openWurli | - | 5 | 1 | 20% | lfo 1 | A,B |
| GranularSynth | - | - | 17 | 7 | 41% | env 2, filter 3, lfo 1, wave 1 | B |
| Sampler / Player | - | - | 6 | 2 | 33% | wave 1, lfo 1 | B |
| DrumKit | - | - | 2 | 0 | 0% | - | B |
| C64SID | - | - | 2 | 1 | 50% | lfo 1 | A,B |

(Sections column: counts only given where tabs exist; the dump walked `sections` and `tabs[].sections`; the
Tone core layouts have 6 sections each.)

### 3.2 Registered but not rendered by DOMSynthPanel (bespoke editor wins)

Odin2 (12 ctrls, 10 cv), Surge (12, 10), Vital (15, 11), V2 (33, 31, 94%), V2Speech (5, 2), DubSiren (19, 12),
HarmonicSynth (12, 8), SpaceLaser (20, 7), WobbleBass (23, 21, 91%), Synare (25, 19), Monique (93, 80, 86%),
VL1 (15, 7), Sfizz (12, 1), PinkTrombone (10, 2), DECtalk (4, 1), Sam (6, 1), and Furnace x5 layouts
(FurnaceGBHWSeq 2, FurnaceWaveSynth 10, FurnaceSID3 31, FurnaceOPLDrums 4, FURNACE_LAYOUT 2 controls).
Several of these have the highest curve-able share (V2, WobbleBass, Monique) but a curve rollout through the
layout descriptor would not reach their editors: their panels (`V2Controls`, `WobbleBassControls`, `MoniqueControls`,
`VitalControls`, `Odin2Controls`, `SurgeControls`, Dispatcher branches at 2017, 1921, 2947, 3338, 3429, 3520)
do not render DOMSynthPanel. A separate decision would be needed (move them onto the layout or give the bespoke
panel a CurvePanel).

## 4. Voice-state reportability (D2 column)

D2 requires envelope stage/level, effective cutoff, or program step per synth. Looked at: the outgoing
`port.postMessage({type})` lines of every worklet in `public/`, the engine class, and Tone's Envelope.

| Engine family | Reports voice state today? | Evidence |
|---|---|---|
| Klystrack (KlysSynth) | PARTIAL yes: program step/tick/running per channel (`programStatus`) and per-channel output level + note starts (`chLevels`). No envelope stage/level, no effective cutoff yet (that is CV-1.5). | `public/klystrack/Klystrack.worklet.js:560` (programStatus), `:575-589` (chLevels); `src/engine/klystrack/KlysEngine.ts:49` (KlysChannelProgram), `:213`, `:254`, `:403` (`subscribeProgramStatus`) |
| Tone.js core: MonoSynth, DuoSynth, Membrane, Noise (single voice) | YES in-thread: `Envelope.value` returns the current level; no worklet. Effective filter cutoff: `Filter.frequency.value` reads the param value, audio-rate envelope modulation is not included: unconfirmed. | `node_modules/tone/build/esm/component/envelope/Envelope.js:79` (`get value()`), `.d.ts:158`; created at `src/engine/factories/ToneJSSynthFactory.ts:176,181,331,348` |
| Tone.js PolySynth-wrapped: Synth, FMSynth, ToneAM, PolySynth, SuperSaw/PWM/Organ/String/Chip (Tone.PolySynth of Tone.Synth) | PARTIAL: voices live in `_activeVoices` which is private (`PolySynth.d.ts:49`); there is no public per-voice read. Would need a voice-hook (wrap the voice class, the factory already passes `VoiceClass` at `ToneJSSynthFactory.ts:579`) | `ToneJSSynthFactory.ts:60,229,262,469,579,660` |
| WobbleBass-style community (not DOMSynthPanel) | uses `Tone.FrequencyEnvelope` + LFO (CommunitySynthFactory.ts:483,541): in-thread readable | n/a to this rollout |
| WavetableSynth (native Web Audio, TS) | Unknown: envelope is scheduled on AudioParams (`WavetableSynth.ts:10,117-122`); no read-back exposed; in-thread so a tracker object could be added | `src/engine/WavetableSynth.ts:10,117` |
| DX7 (Dexed WASM) | NO: worklet only posts ready/patchName/sysexLoaded/voicesLoaded/wasmLoaded | `public/dx7/DX7.worklet.js:105` + `grep -oE "type: '...'"` result |
| OPL3 | NO: ready/sbiLoaded/error | `public/opl3/OPL3.worklet.js:124` |
| V2 | NO: initialized/patchLoaded/error | `public/V2Synth.worklet.js` (message grep) |
| Oidos / Tunefish / WaveSabre | NO: ready (+numParams/synthType/gmdlsLoaded) | `public/oidos/Oidos.worklet.js:135`; `public/tunefish/Tunefish.worklet.js:129`; `public/wavesabre/WaveSabre.worklet.js:165` |
| MdaEPiano / JX10 / DX10 | NO: ready/error only | `public/mda-epiano/MdaEPiano.worklet.js:193`; `mda-jx10/MdaJX10.worklet.js:188`; `mda-dx10/MdaDX10.worklet.js:188` |
| Amsynth, Monique | NO voice state; `audioLevel` is the output peak + a status string | `public/amsynth/AMSynth.worklet.js:275`; `public/monique/Monique.worklet.js:215` |
| Raffo, CalfMono, SetBfree, SynthV1, TalNoizeMaker | NO: `state` is a parameter-value dump (`values`, `numParams`), not voice state | `public/raffo/RaffoSynth.worklet.js:73`; `public/synthv1/SynthV1.worklet.js:74`; `public/calf-mono/CalfMonoSynth.worklet.js:79`; `public/setbfree/SetBfree.worklet.js:122`; `public/tal-noisemaker/TalNoizeMaker.worklet.js:77` |
| ZynAddSubFX, FluidSynth, Sfizz, Aeolus, VL1 | NO: ready/paramValue/preset messages only | `public/zynaddsubfx/ZynAddSubFX.worklet.js:261`; `fluidsynth/FluidSynth.worklet.js:205`; `sfizz/Sfizz.worklet.js:390`; `aeolus/Aeolus.worklet.js:144`; `vl1/VL1.worklet.js:752` |
| CZ101 | NO: ready/error only (it has `keyOff` voice index as an input, not a report) | `public/cz101/CZ101.worklet.js:72`; `src/engine/cz101/CZ101Synth.ts:376` |
| D50 (MAME Roland SA via MAMEEngine) | NO for envelope; the MAME worklets post `oscData` (a waveform buffer) and some chips (CMI, FZ, KS0164) post `voiceStatus`, but RolandSA does not | `public/mame/RolandSA.worklet.js:50`; `src/engine/d50/D50Synth.ts:17,240` |
| TR808 / TR909 / TR707 | Unknown: not read (TR909 is a TS synth `src/engine/tr909/TR909Synth.ts`, in-thread) | not looked at beyond file listing |
| OpenWurli | NO: `paramValue`/ready | `public/openwurli/OpenWurli.worklet.js:46,139` |
| Granular, Sampler/Player (Tone.GrainPlayer/Sampler), C64SID, DrumKit | Unknown | not looked at |

Consequence for D2 ("no curve ships without live voice state"): the only engines that can report today
without touching C/C++ are the Tone.js ones (single-voice directly, PolySynth family via a voice hook) and
Klystrack (partial). Every WASM worklet in the layout set needs a new exported getter plus a new worklet message
(the CV-1.5 pattern: `klys_get_channel_voice` in `KlysWrapper.c`), roughly one C change and one rebuild per
engine. Two shared C++ bases would cover several layouts (the Zynthian/`vstbridge` family; the MDA family): not
verified.

## 5. Ranking (CV-0.3, D3)

Score = (editor-usage proxy) x (curve-able controls) with the engine-cost column from section 4 as a tie-break,
since D2 makes engine reporting a hard dependency. There is no usage telemetry in the repo; usage proxy is
judgement from: default palette synths created from the instrument menu (Tone.js core, community synths),
format-native synths (a song brings them: OPL3, DX7, WaveSabre/Tunefish/Oidos, CZ101, D50), and bundled third-party
instruments (Amsynth, CalfMono, SynthV1, ...). Preset counts per synth were attempted by grep and abandoned
(shell glob error); not measured.

Scores (usage 1-3 x cv count; usage: 3 = default/format-native, 2 = bundled, 1 = niche):

| Rank | Group | Layouts | cv total | Usage | Engine voice-state | Why here |
|---|---|---|---|---|---|---|
| 1 | Tone.js core | Synth, MonoSynth, DuoSynth, FMSynth, ToneAM (+Pluck, Metal, Membrane, Noise) | 17+17+17+19+18 (+20) | 3 | Yes in-thread (Envelope.value); PolySynth voice hook for Synth/FM/AM | 5 layouts with identical shape: one descriptor set, one hook; 81-83% curve-able; every kind present (env, filter, lfo, wave, fm) |
| 2 | Community subtractive on Tone/native | PWMSynth, SuperSaw, Wavetable, PolySynth, FormantSynth, ChipSynth, StringMachine | 17+13+15+4+10+8+4 | 3 | Tone PolySynth hook (same as 1); Wavetable native needs a state object | 76-89% curve-able; reuses rank 1 engine work; Organ (6%) and DrumMachine excluded (low share) |
| 3 | FM, format-native | DX7, OPL3 | ~66 + 12 | 3 | NO (new exports in both WASM) | Biggest share of format users; DX7 has 7 envelope sections (56 stage controls) and an algorithm diagram component exists (`FMAlgorithmDiagram`); costs two engine changes |
| 4 | Demoscene WASM | WaveSabreFalcon, WaveSabreSlaughter, Tunefish, Oidos | 18+16+28+13 | 2-3 | NO (4 worklets, 3 WASM bases) | 72-82% curve-able (Tunefish 56%); songs carry them; Falcon layout also serves `WaveSabreSynth` |
| 5 | Classic subtractive WASM | Amsynth, CalfMono, MdaJX10, RaffoSynth | 31+37+19+18 | 2 | NO | 56-79% curve-able, each a straightforward env/filter/lfo/wave set; one WASM change per engine |
| 6 | Large VA WASM | SynthV1, TalNoizeMaker, ZynAddSubFX | 56+49+39 | 2 | NO | most controls (100/77/63) but widest layouts and heaviest engine work; do last |

Not ranked / defer: drum machines TR808/TR909/TR707 (26-32% share, decay envelopes only), Organ/SetBfree/Aeolus
(drawbar/stops, 3-19%), FluidSynth/Sfizz/Sampler/Granular/DrumKit/C64SID/OpenWurli/CZ101/D50 (low share or
tiny layout), MdaEPiano/MdaDX10 (38-42%).

Recommended first six groups after the klystrack pilot (CV-2.1..2.6): the six above, in that order. Order rationale:
1 and 2 need no C/C++ rebuild, so they are the only groups that can satisfy D2 immediately and they prove the
non-WASM voice-hook path; 3 is highest format-native value; 4-6 each add a WASM export and are ordered by
curve-able share per engine change.

Findings that change the plan (for the owner, not decisions taken here):
- The three highest-share layouts that are NOT reachable through DOMSynthPanel: V2 (94%), WobbleBass (91%), Monique
  (86%). Curves for them need either a layout host or a CurvePanel inside their bespoke panel.
- 21 of 68 registered layouts (16 + 5 Furnace) are never rendered by DOMSynthPanel; the plan's "57 layouts" overstates
  the rollout surface: reachable = 47 layouts / 49 synth types.
- `Tone.PolySynth` hides its voices (`_activeVoices` private); a voice-reporting wrapper is shared work for groups 1-2.

## 6. Summary table (CV-0.2 deliverable)

| Layout | Curve kinds present | Voice-state reportable | Evidence |
|---|---|---|---|
| KlysSynth | env, filter, lfo, wave, fm | ? partial (program step + channel level yes; envelope/cutoff no) | Klystrack.worklet.js:560,589; KlysEngine.ts:403 |
| Synth / FMSynth / ToneAM | env, filter, lfo, wave, (fm) | ? partial (PolySynth voices private) | ToneJSSynthFactory.ts:60,229,262; PolySynth.d.ts:49 |
| MonoSynth / DuoSynth | env, filter, lfo, wave | Y (Envelope.value) | Envelope.js:79; ToneJSSynthFactory.ts:176,181 |
| Pluck / Metal / Membrane / Noise | env, filter, (fm) | Y for Membrane/Noise/Metal single voice; ? for Pluck | ToneJSSynthFactory.ts:297,320,331,348 |
| PWMSynth, SuperSaw, PolySynth, ChipSynth, StringMachine, Organ | env, filter, lfo, wave | ? partial (as PolySynth) | ToneJSSynthFactory.ts:469,579,660 |
| FormantSynth, DrumMachine | env, filter | ? (Tone nodes; voice access not checked per class) | CommunitySynthFactory.ts:259; ToneJSSynthFactory.ts:768-1201 |
| Wavetable | env, filter, lfo, wave | ? (native, in-thread, no read-back) | WavetableSynth.ts:10,117 |
| DX7 | env (56), lfo, fm | N | DX7.worklet.js:105 |
| OPL3 | env, wave, fm | N | OPL3.worklet.js:124 |
| V2 (not reachable) | env, filter, lfo, wave | N | V2Synth.worklet.js |
| WaveSabreFalcon/Slaughter | env, wave, filter, fm, xfer | N | WaveSabre.worklet.js:165 |
| TunefishSynth | filter, wave, xfer, lfo | N | Tunefish.worklet.js:129 |
| OidosSynth | env, filter, wave, fm, xfer | N | Oidos.worklet.js:135 |
| MdaEPiano / MdaJX10 / MdaDX10 | env, filter, lfo, wave | N | Mda*.worklet.js:188/193 |
| Amsynth | wave, env, filter, lfo, xfer | N (audioLevel = output peak) | AMSynth.worklet.js:275 |
| RaffoSynth | wave, env, filter | N (state = param dump) | RaffoSynth.worklet.js:73 |
| CalfMono | env, lfo, wave, filter | N (param dump) | CalfMonoSynth.worklet.js:79 |
| SynthV1 | env, lfo, wave, filter, fm | N (param dump) | SynthV1.worklet.js:74 |
| TalNoizeMaker | wave, lfo, env, filter, fm | N (param dump) | TalNoizeMaker.worklet.js:77 |
| ZynAddSubFX | wave, env, filter, xfer | N | ZynAddSubFX.worklet.js:261 |
| SetBfree, Aeolus, FluidSynth, Sfizz | mostly none | N | SetBfree.worklet.js:122; Aeolus.worklet.js:144; FluidSynth.worklet.js:205; Sfizz.worklet.js:390 |
| CZ101 | wave, lfo | N | CZ101.worklet.js:72 |
| D50 | wave, filter | N | RolandSA.worklet.js:50; D50Synth.ts:240 |
| TR808 / TR909 / MAMETR707 | env, filter (few) | ? not read | TR909Synth.ts (listing only) |
| OpenWurli | lfo | N | OpenWurli.worklet.js:139 |
| Granular, Sampler, Player, DrumKit, C64SID | wave/lfo (few) | ? not read | - |
| Odin2, Surge, Vital, Monique, VL1 (not reachable) | env, filter, lfo, wave | N (Monique: audioLevel only; others: vstbridge worklet not read in full) | Monique.worklet.js:215; vstbridge/VSTBridge.worklet.js:100,109 |
| Furnace x5 (not reachable) | wave (few) | ? not read | - |

## 7. Not confirmed

- Classification is regex-based; DX7 and OPL3 hand-corrected, others not hand-audited (+-10 points).
- Usage proxy is judgement, not telemetry; per-synth preset counts were not obtained.
- Router branches before line 255 not read; TR707/TR808/TR909, Granular, Sampler, Player, C64SID, DrumKit, Furnace
  voice-state not looked at; FormantSynth/DrumMachine/StringMachine voice class access not checked.
- Whether `Filter.frequency.value` includes audio-rate envelope modulation in Tone 14.7.39: not tested.
- Whether Odin2/Surge/Vital/VSTBridge worklet (`public/vstbridge/VSTBridge.worklet.js`) report voice state: only
  lines 100-109 seen, not read in full.
- That one C change can serve multiple WASM families (MDA, Zynthian bases): not examined.
