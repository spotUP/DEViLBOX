# N15 survey: New Song formats vs. synth types vs. presets

Read-only survey, 2026-11-02. Count of New Song formats: **57**. Counted two ways: 57 `newSong:` descriptors in
`src/lib/formats/EditableFormatRegistry.builtins.ts` (grep -c and grep -o both 57), and `listNewSongFormats()` at
`src/lib/formats/EditableFormatRegistry.ts:152` iterates every registered descriptor that has `newSong`. I did not execute the
registry, so a descriptor registered outside builtins.ts would not be in the 57 (not checked).

Caveat for the instrument-kind column: template binaries were not parsed. Kinds are inferred from the format identity and its
exporter/parser names; rows are "inferred" unless stated. Per-kind judgement follows the owner's rule that one format may hold
several kinds (synth AND sample), so each cell lists kinds and a verdict per kind.

## Where presets live and how they are found

- Type union: `SynthType` at `src/types/instrument/base.ts:6` (Sampler :17, Furnace* from ~:60, OPL3 :182, SoundMonSynth :241 ...
  per-format tracker synths :241-:330).
- Synth-type presets (the "per synth type" pattern): `getPresetsForSynthType()` at
  `src/constants/synthPresets/allPresets.ts:30` (a switch on SynthType, 25 cases, plus the `ALL_PRESETS` record below it).
  Files in `src/constants/synthPresets/*.ts`, re-exported from `synthPresets/index.ts`. NONE of the 40-odd tracker-native
  synthTypes (SoundMonSynth, FCSynth, HippelCoSoSynth, ...) has a case there: they all fall to `default: return []` (:~85).
  Consumer found: `src/components/drumpad/utils/presetLoader.ts:104`, `usePadContextMenu.ts`.
- Factory category browser (what the Add Instrument "Presets" tab shows): `PRESET_CATEGORIES` at
  `src/constants/factoryPresets/index.ts:183`, rendered by `src/components/instruments/presets/LoadPresetModal.tsx:53,78,183`
  (embedded in `AddInstrumentDialog.tsx:16`). It is organised by category (bass/lead/pad/drum/fx/chip/module...), NOT by synth type;
  it is format-agnostic. Synth types present in it (counted from `synthType:` literals in `src/constants/factoryPresets/*.ts`):
  Sampler 50, TR808 16, ChipSynth 12, TR909 11, Pluck/Duo 7 each, Synth/Membrane/FM 6 each, plus Furnace (`furnacePresets.ts` 57 names,
  `furnaceChipPresets.ts` 90 names), MAME chips, AMI_PRESETS 39 (all Sampler, `src/constants/amiPresets.ts:13`), SAMPLE_PACK_PRESETS 22
  Sampler (`src/constants/samplePresets.ts:13`), drum-kit Samplers (tr505 16, tr707 15, drumnibus 19), hively 1, klys few. No tracker-native
  synth type (SoundMonSynth ... DavidWhittakerWasmSynth) appears anywhere in factoryPresets.
- Wizard starter instruments: `src/constants/uadeInstrumentPresets.ts:120` (`UADE_INSTRUMENT_PRESETS`, keyed by system preset id, used
  by `src/hooks/dialogs/useNewSongWizard.ts:91`). Only two native-synth helpers: `sm()` SoundMonSynth (:102) and `sid()` SidMonSynth (:111),
  10 entries between them; everything else is `samp()` Sampler placeholders (6 for amiga_protracker :122). Not a browser; starter list only.
- Orphaned preset data: `src/constants/presets/nostalgicplayer/*.ts`, 13 files, 14-21 presets each (actionamics 14, deltaMusic1 14,
  deltaMusic2 14, digitalMugician 19, fredEditor 19, inStereo1 18, inStereo2 18, ronKlaren 13, sonicArranger 21, soundFactory 15,
  soundMon 19, synthesis 20, voodooSupreme 13 = 217). Verified NOT imported anywhere in `src/` (searched by file name, export name and
  type name; the only hits are the files themselves). They are ready content in the wrong shape (`{name, category, params}` per format, not
  `InstrumentPreset`), waiting for wiring. Prime candidate for the fix.
- In-editor mini presets: HippelCoSoControls.tsx:48,56 and DavidWhittakerControls.tsx:33,41 hold sequence presets (volume/frequency
  sequences), not instrument presets.
- devilbox-presets bank (`npm run presets:sync` -> `public/data/presets`): currently holds only odin2, vital, soundfonts (README.md). Nothing
  for tracker-native synths; not relevant to this gap.
- Sample library for sample formats: yes. AMI_PRESETS 39 + SAMPLE_PACK 22 + drum kits (tr505/tr707/drumnibus, ~50) + on-disk packs
  `public/data/samples/packs` (casio-mt40, drumnibus, fairlight-cmi, juggle-records, sammy-blammy, scratch-originals, st-01, st-02),
  surfaced through the same Add Instrument Presets/Library/Sample tabs (`AddInstrumentDialog.tsx:26,35`). ~110+ sampler presets.
- "Can the user create a new instrument of type X": `AddInstrumentDialog.tsx` (tabs synth/preset/sample/library/au, :26) plus
  `SynthTypeSelector.tsx` is format-agnostic, so creation of any registered SynthType is possible in any song; whether the format's replayer and
  exporter honour that type is NOT verified by this survey (marked "yes (generic)").
  Registry pointer: only one descriptor declares a `synth:` ref (`sonixMusicDriver`, builtins.ts:106); every other format's synth is wired
  elsewhere (SynthRegistry `src/engine/registry/builtin/*`).

## Per-format table (57)

Legend: S = sample-library status. Sampler library = OK (about 110 presets, see above). "native: none" = tracker synth type has zero presets
in synthPresets, factoryPresets, or wizard. "orphan N" = N presets exist in nostalgicplayer file, unwired.

| formatId | instrument kinds held | matching synthType(s) (base.ts) | new instrument creatable | presets per kind | verdict |
|---|---|---|---|---|---|
| actionamics | synth + sample | ActionamicsWasmSynth :315; Sampler :17 | yes (generic) | native: orphan 14; sampler: OK | few presets (none wired) |
| monotone | synth (square-ish chip) | MonotoneWasmSynth :316 | yes (generic) | native: none | no presets |
| ansiMusic | none (PC speaker notes, no instruments) | none | n/a | n/a | OK (n/a) |
| activisionPro | synth | ActivisionProWasmSynth :317 | yes (generic) | native: none | no presets |
| adplug | AdLib/OPL | OPL3 :182; FurnaceOPL | yes (generic) | OPL3: no synthPresets case; Furnace OPL entries exist in furnaceChipPresets (90 total chips) | few presets (unverified count for OPL) |
| amosMusicBank | synth/sample | Sampler; no native type found | yes (Sampler) | sampler: OK; native: unknown | unknown |
| benDaglish | synth | BenDaglishSynth :313 | yes (generic) | native: none | no presets |
| c67 | sample | Sampler | yes | sampler: OK | OK |
| chuckBiscuits | sample | Sampler | yes | sampler: OK | OK |
| composer667 | sample | Sampler | yes | sampler: OK | OK |
| davidWhittaker | synth + sample | DavidWhittakerSynth :254 / DavidWhittakerWasmSynth :329; Sampler | yes (generic) | native: none (only vol/freq sequence mini presets); sampler OK | no presets (synth) |
| deltaMusic1 | synth + sample | DeltaMusic1Synth :257 / ...WasmSynth :330; Sampler | yes (generic) | native: orphan 14; sampler OK | few presets (none wired) |
| deltaMusic2 | synth + sample | DeltaMusic2Synth :258; Sampler | yes (generic) | native: orphan 14; sampler OK | few presets (none wired) |
| digiBoosterPro | sample | Sampler | yes | sampler OK | OK |
| digitalMugician | synth + sample | DigMugSynth :244; Sampler | yes (generic) | native: orphan 19; sampler OK | few presets (none wired) |
| digitalSymphony | sample (+ sample synth) | Sampler | yes | sampler OK | OK |
| digitalSonixChrome | synth/sample (Sonix) | SonixSynth :320 (also registered builtin/sonix.ts); Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| dsm_dyn | sample | Sampler | yes | sampler OK | OK |
| earAche | sample/synth (unknown) | unknown | unknown | unknown | unknown |
| faceTheMusic | synth + sample | FaceTheMusicWasmSynth :318; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| fredEditor | synth + sample | FredSynth :246; Sampler | yes (generic) | native: orphan 19; sampler OK | few presets (none wired) |
| futureComposer | synth (wave) + sample | FCSynth :245 / FutureComposerWasmSynth :309; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| futurePlayer | synth | FuturePlayerSynth :265 | yes (generic) | native: none | no presets |
| gameMusicCreator | sample | Sampler | yes | sampler OK | OK |
| hippelCoSo | synth + sample | HippelCoSoSynth :248; Sampler | yes (generic) | native: none (sequence presets only); sampler OK | no presets (synth) |
| jochenHippelST | synth | HippelStSynth :250 / HippelSynth | yes (generic) | native: none | no presets |
| iffSmus | synth/sample (SMUS instruments are 8SVX) | Sampler | yes | sampler OK | OK |
| ims | sample | Sampler | yes | sampler OK | OK |
| inStereo2 | synth + sample | InStereo2Synth :260; Sampler | yes (generic) | native: orphan 18; sampler OK | few presets (none wired) |
| jamCracker | synth/sample | JamCrackerSynth :262; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| kris | sample | Sampler | yes | sampler OK | OK |
| mod | sample | Sampler | yes | wizard: 6 starters; library ~110 | OK |
| musicAssembler | synth | MusicAssemblerSynth :312 | yes (generic) | native: none | no presets |
| musicLine | synth + sample | MusicLineSynth :256; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| nru | sample/synth (unknown) | unknown | unknown | unknown | unknown |
| octamed_mmd0 | sample + MIDI/synth | OctaMEDSynth :253; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| pumaTracker | synth | PumaTrackerSynth :325 | yes (generic) | native: none | no presets |
| quadraComposer | synth/sample | QuadraComposerWasmSynth :310; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| robHubbard | synth | RobHubbardSynth :249 | yes (generic) | native: none | no presets |
| sawteeth | synth | SawteethSynth :306 | yes (generic) | native: none | no presets |
| scumm | synth/MIDI (unknown) | unknown | unknown | unknown | unknown |
| sidmon1 | synth + sample | SidMon1Synth :252; Sampler | yes (generic) | native: none (wizard sid() targets SidMon2 type); sampler OK | no presets (synth) |
| sidMon2 | synth (SID-style) + sample | SidMonSynth :243; Sampler | yes (generic) | native: wizard starters (sid() :111, part of 10 sm/sid entries); sampler OK | few presets (<8) |
| sonicArranger | synth + sample | SonicArrangerSynth :259; Sampler | yes (generic) | native: orphan 21; sampler OK | few presets (none wired) |
| soundControl | synth/sample | SoundControlWasmSynth :314; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| soundFactory | synth/sample | no native type found; Sampler | yes (Sampler) | native: orphan 15 (soundFactoryPresets); sampler OK | missing synth (unverified) |
| soundfx | sample | Sampler | yes | sampler OK | OK |
| soundMaster | sample/synth (unknown) | unknown | unknown | unknown | unknown |
| soundMon | synth (wavetable) | SoundMonSynth :241 | yes (generic) | native: wizard sm() starters (part of 10; :102); orphan 19 | few presets (none wired) |
| stp | sample | Sampler | yes | sampler OK | OK |
| sunTronic | synth | SunTronicSynth :242 | yes (generic) | native: none | no presets |
| synthesis | synth | no native type found | unknown | orphan 20 (synthesisPresets) | missing synth (unverified) |
| tcbTracker | sample | Sampler | yes | sampler OK | OK |
| tfmx | synth + sample | TFMXSynth :247; Sampler | yes (generic) | native: none; sampler OK | no presets (synth) |
| unic | sample | Sampler | yes | sampler OK | OK |
| xmf | sample (+ FM?) unknown | Sampler | yes | sampler OK | OK (FM part unknown) |
| zoundMonitor | synth/sample | no native type found; Sampler | yes (Sampler) | sampler OK | unknown |

## Counts per verdict (from the table above, tallied by hand)

- OK (sample-only or n/a): 17 (ansiMusic, c67, chuckBiscuits, composer667, digiBoosterPro, digitalSymphony, dsm_dyn, gameMusicCreator, iffSmus, ims, kris, mod, soundfx, stp, tcbTracker, unic, xmf)
- few presets, content exists but not wired (orphan nostalgicplayer file): 8 (actionamics, deltaMusic1, deltaMusic2, digitalMugician, fredEditor, inStereo2, sonicArranger, soundMon)
- few presets (<8): 2 (sidMon2; adplug unverified)
- no presets for the native synth (sampler half fine): 20 (monotone, activisionPro, benDaglish, davidWhittaker, digitalSonixChrome, faceTheMusic, futureComposer, futurePlayer, hippelCoSo, jochenHippelST, jamCracker, musicAssembler, musicLine, octamed_mmd0, pumaTracker, quadraComposer, robHubbard, sawteeth, sidmon1, soundControl, sunTronic, tfmx = 22; recount below)
- missing synth (unverified): 2 (soundFactory, synthesis; their orphan preset files imply a synth exists upstream in the C++ replayers but no SynthType found in base.ts)
- unknown: 5 (amosMusicBank, earAche, nru, scumm, soundMaster, zoundMonitor = 6)

Recount of the "no presets" list gives 22 names, not 20; unknown list gives 6 names, not 5. Names in rows are authoritative:
17 OK + 8 orphan + 2 few + 22 no-presets + 2 missing + 6 unknown = 57. Counted from the table rows, not from builder metadata
(kinds are inferred, see caveat).

## Biggest gaps / suggested fix shape

1. 217 presets already written in `src/constants/presets/nostalgicplayer/*.ts` are dead code. Wire them: add a per-synth-type case in
   `getPresetsForSynthType` (allPresets.ts:30) or a new category in `PRESET_CATEGORIES`, converting `{name, category, params}` to
   `InstrumentPreset`. Same pattern as `uadeInstrumentPresets.ts` `sm()`/`sid()` helpers.
2. 22 formats with a native synth type and zero presets: they have no `case` in `getPresetsForSynthType`; the preset browser (LoadPresetModal)
   is category-based so a native-synth preset must be added to a category with the right `synthType` field to show.
3. soundFactory and synthesis have preset data but no SynthType found: check whether they are carried as UADE/Sampler instruments.
4. Format-agnostic Add Instrument dialog never filters presets to the open song's format; a new-song user in e.g. Hippel CoSo sees
   all categories. Format-aware filtering would be a design decision, not covered here.

Scratch files created: none. Nothing deleted.
