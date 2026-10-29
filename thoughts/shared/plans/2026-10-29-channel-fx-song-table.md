---
date: 2026-10-29
author: spot
status: plan, not started
topic: Per-channel FX song table, pattern commands, automation lanes, master FX overhaul
research:
  - thoughts/shared/research/2026-10-29_per-channel-fx-pattern-command.md
  - thoughts/shared/research/2026-10-29_master-fx-current-map.md
  - thoughts/shared/research/2026-10-29_lanes-render-persistence-map.md
  - thoughts/shared/research/2026-10-29_engine-per-channel-outputs.md
---

# Per-channel FX song table, pattern commands and lanes

## Goal

Every song carries a numbered effect table (presets 00-FF). Any channel, and the master channel, can run up to
8 presets in its insert chain. Pattern commands 0x80-0x8C and automation lanes drive the same router target. The
old master FX store, the `masterFx.slotN` router keys and the 4-slot channel insert cap go away. Every song engine
gets a per-channel insert mode, so the table works on every format, not only the Tone path.

## Owner decisions (2026-10-29, final)

| # | Decision |
|---|----------|
| D1 | Song effect table: presets 00-FF per song, shown beside the instrument list, stored in .dbx. A preset's effect node is created on a channel's insert chain on first use. |
| D2 | Lanes and pattern command built together; both feed the router target `chfx.<channel>.<preset>.<param>` (`<channel>` is a decimal channel index or `master`, `<preset>` two hex digits). |
| D3 | Lane view: automatic plus override. Play collapses to compact. Stop or edit reopens the last edited lane full-area. A pin toggle keeps the manual choice. |
| D4 | Enter full-area editing by clicking a compact lane. Leave with Esc or a channel header click. Command palette / menu entry too. |
| D5 | Playback keeps running and the full-area editor follows. Follow pauses while a drag is active. |
| D6 | Knob recording mode selector: Touch / Latch / Overwrite. Touch is the default. |
| D7 | Commands 0x80-0x8C, "select + verbs" (table below). Glyphs drawn in accent colour. Last-selected preset tracked per channel. |
| D8 | All song engines get a per-channel insert mode in this plan (C/WASM work included). |
| D9 | Up to 8 active presets per channel (old cap 4). |
| D10 | DJ mode keeps its own master chain: same effect model and editor, stored in DJ settings. Song master FX play only in the tracker. |
| D11 | Seven phases, model first (below). |
| D12 | Clipboard: tracker clipboard and undo history carry automation points; a pattern block copy takes the lanes in its row range. `useAutomationStore.copyCurve/pasteCurve` are removed. |
| D13 | Scenes: 8 per song, stored in .dbx. `8C xx` = morph position toward the target scene, previous scene as source. Macros: 8 per preset, each up to 8 param targets with min/max. |
| D14 | Browser hover preview after 300 ms, during playback only. It inserts the effect temporarily on the selected channel and writes no state. |
| D15 | A/B = two param snapshots per card. Level-matched bypass = RMS match over the last 2 s, applied while bypassed, built on the existing gain compensation. |

### Command set (D7)

Commands act on the chain of the channel they are written on. The master chain is driven by lanes and the
global automation lane, not by pattern commands.

| Code | Glyph | Meaning |
|------|-------|---------|
| `80 xx` | `E` | Enable preset xx on this channel (create node on first use, append to chain), select it |
| `81 xx` | `B` | Bypass preset xx on this channel, select it |
| `82 xx` | `W` | Wet of the selected preset, xx 00-FF maps to 0-100 % |
| `83 xx`-`8A xx` | `1`-`8` | Macro 1-8 of the selected preset, xx 00-FF maps to 0-1 |
| `8B xx` | `S` | Send amount from this channel to the selected send preset, 00-FF maps to 0-1 |
| `8C xx` | `M` | Scene morph position toward the target scene, 00-FF maps to 0-1 |

Freeze example: `8003` on row 4 enables preset 03; `8103` on row 12 bypasses it.

### Implementation defaults (stated, not asked)

- Range 0x79-0x9F is free (verified by the glyph chain and by importer literal grep). This plan takes 0x80-0x8C
  and adds a reserved-range registry with a non-overlap test, so later formats cannot collide.
- Commands apply on tick 0 of the row, scheduled at the row's audio time (same clock as the Cxx path in
  `TrackerReplayer.ts:1449-1460`).
- Scene target: the scene armed in the scene panel or by lane param `scene.target`. Source: the last scene fully
  reached (position 1.0) or recalled.
- When an engine cannot isolate a channel yet (before its P3 item lands), the chain runs on the Tone path only
  and the channel header shows "Insert not available on this engine". After P3 this state does not exist.
- Per-channel insert mode on WASM engines: the inserted channel leaves main mix output 0 and plays at unity on
  output `DUB_OUTPUT_BASE + ch`. This lifts the 4-isolation-slot cap. On an inserted channel the dub send taps
  post-insert (from the chain output).

## Data model

New file `src/types/songEffects.ts`:

```ts
import type { EffectConfig } from './instrument/effects';

export const SONG_FX_PRESET_COUNT = 256;
export const MAX_CHAIN_PRESETS = 8;
export const SONG_FX_MACRO_COUNT = 8;
export const SONG_FX_MACRO_TARGETS = 8;
export const SONG_FX_SCENE_COUNT = 8;

export type FxChainKey = number | 'master';

export interface FxMacroTarget { param: string; min: number; max: number }
export interface FxMacro { name: string; value: number; targets: FxMacroTarget[] }

export interface FxPresetAB {
  a: Record<string, number | string>;
  b: Record<string, number | string>;
  active: 'a' | 'b';
}

export interface SongFxPreset {
  index: number;                 // 0x00-0xFF
  name: string;
  role: 'insert' | 'send';
  effect: EffectConfig;          // existing type, types/instrument/effects.ts:172
  macros: FxMacro[];             // length SONG_FX_MACRO_COUNT (P6)
  ab?: FxPresetAB;               // P7
  levelMatch: boolean;           // P7
}

export interface FxChainSlot { preset: number; enabled: boolean; wet: number }

export interface FxScene {
  name: string;
  values: Record<string, number>;   // router key -> normalised 0-1
}

export interface SongEffects {
  presets: Record<number, SongFxPreset>;
  chains: Record<string, FxChainSlot[]>;            // key String(channel) or 'master'
  sendAmounts: Record<string, Record<number, number>>; // channel -> send preset -> 0-1 (P6)
  scenes: (FxScene | null)[];                         // length SONG_FX_SCENE_COUNT (P6)
}
```

Store `src/stores/useSongEffectsStore.ts` (zustand + immer, same shape as `useMixerStore`). It is the single
source of truth for song FX. Runtime selection state (`selectedPreset` per channel, scene source/target, morph
position) lives in the same store under `runtime`, which is not persisted.

## Phases and checklist

Running count is reported after each item while implementing. A phase is done only when every item, its
automated checks and its reachability test pass.

Total items: 112 (P1 18, P2 16, P3 33, P4 11, P5 15, P6 10, P7 9).

---

### P1 Song effect table, one effect model, master migration (.dbx 27)

Changes:

- P1-01 Add `src/types/songEffects.ts` (snippet above).
- P1-02 Add `src/stores/useSongEffectsStore.ts`: actions `setPreset`, `removePreset`, `renamePreset`,
  `addToChain(chain, preset)` (rejects at `MAX_CHAIN_PRESETS`), `removeFromChain`, `reorderChain`,
  `setSlotEnabled`, `setSlotWet`, `updatePresetParams`, `loadSongEffects`, `reset`.
- P1-03 Add `src/engine/fx/SongFxRuntime.ts`: owns effect nodes per `(chain, preset)`, created lazily through
  `engine/factories/EffectFactory.ts` on first use. Subscribes to `useSongEffectsStore` and diff-applies chain
  changes. Exposes `applyCommand(channel, code, param, time)` (filled in P2) and `getNode(chain, preset)`.
- P1-04 Channel chains on the Tone path: `engine/ChannelEffectsManager.ts` reads its chain from `SongFxRuntime`;
  remove `MAX = 4` at :19, cap becomes `MAX_CHAIN_PRESETS`.
- P1-05 Master chain: `engine/tone/MasterEffectsChain.ts` `rebuildMasterEffects` (:191) takes
  `chains.master` resolved to `EffectConfig[]` from `SongFxRuntime`; `usePatternPlayback.ts:148-154`
  subscribes to `useSongEffectsStore` instead of `useAudioStore.masterEffects`.
- P1-06 Remove `masterEffects` and its actions from `src/stores/useAudioStore.ts` (:32, :185-292). Every caller
  moves to `useSongEffectsStore` (callers listed by `tsc` after the removal, not by grep).
- P1-07 Remove `MixerChannelState.insertEffects` (`useMixerStore.ts:817`) and the cap at :1117; callers move to
  `useSongEffectsStore.chains`.
- P1-08 DJ master chain (D10): add `djEffects: SongEffects` (only `presets` + `chains.master` used) to the DJ
  settings store; `engine/tone/masterFxGraph.ts` `assembleMasterFxGraph` gets the chain from its caller, so
  the DJ mixer passes `djEffects` and the tracker passes the song table.
- P1-09 Schema bump: `lib/persistence/migrations/index.ts` `CURRENT_SCHEMA` 26 to 27, step:

  ```ts
  if (fromVersion < 27) {
    migrateToSongEffects(project);   // masterEffects + mixer.channels[*].insertEffects -> songEffects
  }
  ```

  `migrateToSongEffects` (new file `lib/persistence/migrations/songEffects.ts`) assigns preset numbers from 00
  upward: master effects first, then channel inserts in channel order; identical `EffectConfig`s (same type and
  parameters) share one preset. Deletes `project.masterEffects` and each `insertEffects`.
- P1-10 localStorage: the persisted audio/mixer keys bump their version and run the same
  `migrateToSongEffects`; old keys are read only through the migration (project rule "localStorage schema
  versioning").
- P1-11 Router key migration: `masterFx.slotN.<param>` to `chfx.master.<preset>.<param>` in saved MIDI mappings,
  knob banks and automation curves. Files: `src/midi/controllerProfiles.ts`, `src/midi/types.ts`,
  `src/midi/knobBanks.ts`, `src/components/midi/MIDIAssignPopover.tsx`, `src/components/layout/StatusBar.tsx`,
  `src/types/automation.ts`, `src/stores/useAutomationStore.ts`, `src/data/manualChapters.ts`.
- P1-12 `lib/song/snapshotSong.ts` (:88, :127) and `hooks/useProjectPersistence.ts` `buildSavedProject` (:350)
  write `songEffects`; load gate (:464-473) calls `loadSongEffects`. `lib/export/exporters.ts:281/296` .dbx
  type gains `songEffects`, loses `masterEffects`.
- P1-13 Song effect table panel `src/components/effects/SongEffectTable.tsx` beside the instrument list: rows
  `00`-`FF` (only used ones plus one empty row), name, effect type, role. Uses `Button`, `CustomSelect`,
  token classes only. Selecting a row opens the existing editor from `components/effects/editors/index.tsx`.
- P1-14 `ChannelInsertEffectsModal.tsx` and `MasterEffectsPanel` / `MasterEffectsModal` become views of one
  component `FxChainEditor.tsx` (props: `chain: FxChainKey`). `MasterPresetMenu` applies `fxPresets.ts`
  presets into the master chain, keeping `gainCompensationDb`.
- P1-15 MCP compatibility: `add_master_effect`, `update_master_effect`, `toggle_master_effect`,
  `set_master_effects`, `remove_master_effect` (`writeHandlers.ts:1577-1611, 1886`) call
  `useSongEffectsStore` on chain `master`; `get_channel_effect_slots` (:866) reads chains.

Tests:

- P1-16 `lib/persistence/migrations/__tests__/songEffects.test.ts`: v26 project with 2 master effects and 2
  channel inserts (one identical to a master effect) gives 3 presets, correct chains, no `masterEffects`, and
  `migrate` from 21 still reaches 27.
- P1-17 `masterPresetClaims.ts` rig (`src/test/audio/masterChainRig.ts`) runs against the new master chain;
  every existing claim still passes.
- P1-18 Reachability: `src/engine/__tests__/songEffectsLoadReachesChains.test.ts`. Load a v26 .dbx fixture
  through `useProjectPersistence` load (top-level entry), start playback through the transport, assert
  `SongFxRuntime.getNode('master', 0)` exists and `rebuildMasterEffects` was called with it (call-count spy),
  and the channel 1 node exists on the channel chain.

Automated: `npm run type-check`; `nice -n 19 npx vitest run src/lib/persistence src/engine/__tests__/songEffectsLoadReachesChains.test.ts src/test/audio --maxWorkers=2`.

Manual (owner): open an old project with master FX on `http://localhost:5174/`; master FX sound unchanged; song
effect table shows them as presets 00+.

Success: no reference to `masterEffects`, `insertEffects` or `masterFx.slot` left (counted by `tsc` after type
removal, then grep as second check); old projects load and sound the same.

---

### P2 Router target, 0x80-0x8C commands, render, MCP, freeze test

Changes:

- P2-01 `src/midi/performance/parameterRouter.ts`: replace the `masterFx.slot0..2` entries (:639-646) with a
  dynamic resolver for `chfx.<chain>.<preset>.<param>` and `chfx.<chain>.<preset>.wet|enabled|macro1..8`, plus
  `chfx.<chain>.send.<preset>` and `scene.morph`, `scene.target`. `routeParameterToEngine` (L881) dispatches
  to `SongFxRuntime.setParam`. `subscribeToParamLiveValue` (L1336) reports live values for lanes and knobs.
- P2-02 `engine/AutomationPlayer.ts` `applyParameter` (L158): add the `chfx.` branch next to `mixer.*`
  (L172+), calling the router.
- P2-03 `src/engine/automation/AutomationParams.ts`: catalogue entries generated per used preset from the
  effect's parameter list, so lanes can pick them.
- P2-04 `src/engine/effectRanges.ts`: reserved-range registry (every range listed in research doc plus
  `songFx: [0x80, 0x8C]`).
- P2-05 `engine/TrackerReplayer.ts`: in the effect read (L1380) and the multi-column loop (L1449-1460,
  L1591-1595), codes `0x80-0x8C` call `SongFxRuntime.applyCommand(channel, code, param, rowTime)`. Selected
  preset per channel lives in `useSongEffectsStore.runtime.selected[channel]`.
- P2-06 `SongFxRuntime.applyCommand` implements the D7 table; wet, macro, send and morph values ramp over one
  tick to avoid clicks.
- P2-07 Glyphs: `src/lib/import/formats/songFxEffectGlyphs.ts` (`E B W 1-8 S M`), wired into the glyph chain in
  `engine/renderer/TrackerGLRenderer.ts` (L894-955), `TrackerCanvas2DRenderer.ts:407` and
  `lib/xmConversions.ts:223`, drawn in `accent-primary`.
- P2-08 Pattern editor input: typing `80`-`8C` in an effect column is accepted on every format whose editor uses
  the generic effect columns.
- P2-09 MCP read: `readHandlers.ts` `effectToString` (L66-75) prints 2 hex digits for codes above 0x0F (fixes
  ambiguity); new tool `get_song_effects` returns presets, chains, send amounts, scenes, runtime selection.
- P2-10 MCP write: tools `set_song_effect_preset`, `remove_song_effect_preset`, `set_fx_chain`,
  `set_fx_slot` (enabled, wet), `set_fx_param`. Handlers in `bridge/handlers/writeHandlers.ts`, registration
  in `bridge/MCPBridge.ts` (~L289) and `server/src/mcp/mcpServer.ts`. `set_cell` accepts `effTyp` 0x80-0x8C
  unchanged.
- P2-11 `get_mcp_help` catalogue lists the new tools.

Tests:

- P2-12 `src/engine/__tests__/effectRanges.test.ts`: no two ranges overlap; every importer glyph table maps only
  codes inside its own range.
- P2-13 Unit: `SongFxRuntime.applyCommand` table test (each code, selection, ramp target values).
- P2-14 Render: glyph test for `8003` and `8103` in GL text path and Canvas2D path.
- P2-15 MCP handler test: `set_fx_chain` then `get_song_effects` round trip.
- P2-16 Reachability: `src/engine/__tests__/songFxFreezeReachesReplayer.test.ts` (model:
  `fredEditReachesReplayer.test.ts`, mock pattern `cellEditsHeadless.test.ts`). Song with preset 03 = freeze
  effect, `8003` on channel 0 row 4, `8103` row 12. Play through the transport entry. Assert
  `applyCommand` ran exactly twice (sentinel), node `enabled` is false at row 3, true on row 4's scheduled time,
  false on row 12's scheduled time.

Automated: `npm run type-check`; `nice -n 19 npx vitest run src/engine/__tests__/songFx* src/engine/__tests__/effectRanges.test.ts src/bridge --maxWorkers=2`.

Manual (owner): `http://localhost:5174/`, MOD song, preset 03 = Freeze on channel 1, type `8003` row 4 and
`8103` row 12, play. Pass: tail freezes from row 4, releases at row 12; glyphs `E03` / `B03` in accent colour.

---

### P3 Per-channel insert mode on every engine

Source: `thoughts/shared/research/2026-10-29_engine-per-channel-outputs.md`. Counted from
`wasmEngineRegistry.ts` (67 keys) and `WHOLE_SONG_SYNTH_TYPES` (72), cross-checked by `addIsolation(` callers.
Classes: A = 28 (isolation + dub), B = 4 classes (dub only), C = 1 (isolation only), D = 38 (stereo mix only).

Shared changes:

- P3-01 Interface: `IsolationCapableEngine` (`engine/tone/ChannelRoutedEffects.ts:149`) gains
  `supportsChannelInserts(): boolean` and `setChannelInsert(ch: number, on: boolean): void`.
- P3-02 Base mechanism in `src/engine/wasm/WASMSingletonBase.ts` and `public/worklets/channel-outputs.js`:
  message `{ type: 'channelInsert', ch, on }`. Inserted channel is masked out of output 0 and written at unity
  to output `DUB_OUTPUT_BASE + ch`; the dub send for that channel reads post-insert from `SongFxRuntime`.
- P3-03 `ChannelRoutedEffects.ts`: when a chain on channel `ch` becomes non-empty, call `setChannelInsert`,
  connect output `DUB_OUTPUT_BASE + ch` to the chain input, chain output to the master input. The 4-slot
  isolation path stays for features that use it, but song FX no longer use isolation slots.
- P3-04 `NativeEngineRouting.ts:161`: route chain wiring for the playing engine; remove the "Insert not
  available" state once every engine reports `supportsChannelInserts()`.
- P3-05 Test `src/engine/__tests__/channelInsertCoverage.test.ts`: every key in `WASM_ENGINES` plus
  Libopenmpt and FurnaceDispatch reports `supportsChannelInserts() === true` (counted from the registry, not
  a hand list).

Class A (base mechanism already has per-voice outputs; TS flag + worklet mask only). One item per engine so each
is tested:

- P3-06 Base-class engines on `WASMChannelOutputsEngine` (24): SoundControl, DeltaMusic1, DeltaMusic2,
  SoundFx, Gmc, RonKlaren, Actionamics, ActivisionPro, Synthesis, Dss, SoundFactory2, FaceTheMusic, Fred2,
  Oktalyzer (8 voices, 13 outputs), InStereo1, InStereo2, FutureComposer, QuadraComposer, SoundMon, DigMug,
  DavidWhittaker, SonicArranger, EaglePlayer, Nuade (variable voices). Covered by P3-02 plus one
  parameterised test over all 24.
- P3-07 Hively (own worklet): add `channelInsert` handling.
- P3-08 UADE (UADEEditable and UADESynth): add `channelInsert` handling.
- P3-09 Libopenmpt: add `channelInsert` handling.
- P3-10 FurnaceDispatch: add `channelInsert` handling.

Class B (dub outputs exist, isolation off; reuse the dub outputs for inserts):

- P3-11 TFMX (Hippel, TFMXModule; 8 voices; C mixes): C change so an inserted voice skips the C mix.
- P3-12 Cinter4.
- P3-13 Sonix.
- P3-14 SunTronicSong (also its native `_nativeContext` path; see memory note on the meter blind spot).

Class C:

- P3-15 PreTracker (`PreTrackerEngine.ts:483`): add per-voice outputs in C (pretracker-wasm, CMake) and
  `supportsDubSends` true.

Class D (stereo mix only; new per-voice outputs in C, worklet `numberOfOutputs` from `channelOutputNodeOptions`,
WASM rebuild via the module's build script). Each item: read the C mixer, add per-voice output buffers, rebuild,
add to the parameterised test. Chip emulators expose per-channel buffers through their existing per-voice mute
or channel mask (no new DSP):

- P3-16 Klystrack, JamCracker, FuturePlayer, MusicAssembler, BenDaglish
- P3-17 MaxTrax, Pxtone, Organya, Sawteeth, Eupmini
- P3-18 Ixalance, Cpsycle, Sc68, Qsf, Zxtune
- P3-19 Aylet, PiyoPiyo (locate the wasm source first; research found none), TFM, Psgplay, Gme
- P3-20 S98, StoneTracker, MusicMaker (locate the wasm source first), PumaTracker, SteveTurner
- P3-21 SidMon1, ArtOfNoise, Pmdmini, Fmplayer, SidMon2
- P3-22 Mdxmini, MusicLine (build.sh + CMake), Asap, HippelSt, V2M
- P3-23 SunVox (sunvox-wasm; shipped lib is the official warmplace build, so per-module outputs come from its
  own output modules, not from a C change; read `reference_sunvox_lib_shipped` memory first)
- P3-24 Symphonie (symphonie-wasm)
- P3-25 C64SID (locate the worklet first; research found none)
- P3-26 Fix `scripts/build-all-wasm.sh --list` so it detects `build.sh` dirs (it prints "No build system
  found" for several), because P3-16 to P3-25 rebuild through it.

Batches P3-16 to P3-22 hold 5 engines each to keep each commit reviewable; every engine inside a batch still gets
its own entry in the parameterised test and its own commit.

Tests:

- P3-27 Parameterised worklet test (node, no browser): for each engine with a test song in
  `public/data/songs/formats`, render 1 s with channel 0 inserted; assert output 0 has no channel 0 energy
  (compare against render with channel 0 muted) and output `DUB_OUTPUT_BASE + 0` equals the muted difference
  within -60 dB. Resumable: results recorded per engine in `test-data/channel-insert-sweep.json`; `--only
  <engine>` reruns one.
- P3-28 Dub send on an inserted channel taps post-insert (unit, `ChannelRoutedEffects`).
- P3-29 Reachability: `src/engine/__tests__/songFxInsertReachesWasmEngine.test.ts`. Load a SoundMon song
  through the top-level load entry, put preset 00 on channel 2, play. Assert `setChannelInsert(2, true)` was
  sent once (sentinel) and output `DUB_OUTPUT_BASE + 2` is connected to the chain input.
- P3-30 Same reachability through a class D engine (Klystrack) after P3-16.
- P3-31 `npm run sound-check` affected subset only (`--only` per rebuilt engine) shows no regression in the
  unaffected main mix.
- P3-32 MCP `get_audio_level` per channel output works for inserted channels (extend the tool if blind).
- P3-33 Coverage test P3-05 passes: zero engines without inserts.

Automated: `npm run type-check`; per-engine `--only` runs of P3-27; P3-29/P3-30 vitest.

Manual (owner): `http://localhost:5174/`, one song per class (SoundMon A, TFMX B, PreTracker C, Klystrack D),
Freeze on channel 2 via `8000`. Pass: only channel 2 freezes, other channels play dry, no level jump.

---

### P4 Lane display: compact and full-area, automatic expand

Changes:

- P4-01 New store `src/stores/useLaneViewStore.ts`: `expanded: Record<number, string | null>`,
  `fullAreaChannel: number | null`, `pinned: boolean`, `lastEdited: { channel: number; param: string } | null`.
  Replaces the `isExpanded` useState at `AutomationLane.tsx:73`.
- P4-02 Add `'lanes'` to `TrackerViewMode` (`useUIStore.ts:35`); `TrackerView.tsx` branch (L644-650) renders
  `<AutomationLaneEditor channelIndex={gridChannelIndex} />`.
- P4-03 `AutomationLane.tsx` takes a `size: 'compact' | 'full'` prop; compact draws a filled sparkline; full draws
  the editing view rows-aligned with the pattern. Same component, larger size (no second view).
- P4-04 Visuals: channel colour (`types/tracker.ts:176`) curve with soft fill (opacity token), grid matching
  row/beat highlights, plain playhead line (no glow), command markers for 0x80-0x8C rows on the lane, ghost
  lanes for other params of the same preset at low opacity.
- P4-05 Auto behaviour (D3) in a hook `useLaneAutoView.ts`: transport play collapses to compact unless pinned;
  stop reopens `lastEdited` full-area unless pinned. Pin toggle in the lane header (`Toggle`).
- P4-06 Enter/leave (D4): click compact lane opens full-area; Esc or channel header click leaves; command
  palette entry `Open Automation Lane Editor`.
- P4-07 Follow (D5): full-area scrolls with the playhead; follow pauses while a pointer drag is active.
- P4-08 `AutomationLanes.tsx` reserve (L441-452) uses the compact height from the store.

Tests:

- P4-09 Store/hook unit tests for D3 transitions (play, stop, pinned).
- P4-10 Component test: same `AutomationLane` instance type in both sizes.
- P4-11 Reachability: `src/components/tracker/__tests__/laneAutoView.test.tsx`. Render `TrackerView` with a
  lane edited on channel 1, start transport, assert compact; stop, assert view mode `lanes` with channel 1
  (sentinel: `useLaneAutoView` effect ran once per transition).

Automated: `npm run type-check`; `nice -n 19 npx vitest run src/components/tracker/__tests__/lane* src/stores/__tests__/useLaneViewStore* --maxWorkers=2`.

Manual (owner): play/stop toggles compact/full; pin holds; Esc leaves; lanes look right against row highlights.

---

### P5 Lane editing

Changes (all in `src/components/tracker/useLaneEditing.tsx`, extended, not replaced):

- P5-01 Points: click add, drag move, double-click delete, alt-drag bend (per-point `curveType`), shift-drag ramp,
  arrow nudge, typed value entry.
- P5-02 Row snap on by default; auto step mode for on/off params (`enabled`, bypass).
- P5-03 Shape stamps ramp / sine / square / triangle with rate in rows.
- P5-04 Box select, move, scale.
- P5-05 Shared unit formatter `src/engine/automation/paramFormat.ts`: one formatter per param from the effect
  parameter definitions; `Knob.tsx` `formatValue` (L43) and lanes both use it.
- P5-06 Knob recording (D6): `useAutomationStore.recordMode` (L163, currently an unused boolean) becomes
  `'off' | 'touch' | 'latch' | 'overwrite'`; record arm writes knob moves through `subscribeToParamLiveValue`
  into the curve; mode selector `CustomSelect` (Touch default). Manual-override manager arbitrates as today.
- P5-07 Clipboard (D12): `useTrackerStore` clipboard (L317-358) gains `automation` slice; a block copy takes lane
  points in its row range; paste writes them back.
- P5-08 History: `useHistoryStore` `PatternChange` carries automation before/after; every lane edit pushes one
  action (L87).
- P5-09 Remove `copyCurve` / `pasteCurve` from `useAutomationStore` (L150-151, L570-590) and their callers.

Tests:

- P5-10 Point gesture unit tests (each gesture once).
- P5-11 Stamp generator tests (shape and rate).
- P5-12 Record mode tests: touch stops writing on release, latch keeps last value, overwrite replaces range.
- P5-13 Clipboard + undo: copy block with lanes, paste, undo restores both cells and points.
- P5-14 Formatter shared by Knob and lane (same string for same value).
- P5-15 Reachability: `src/engine/__tests__/laneEditReachesPlayback.test.ts`. Add a point through
  `useLaneEditing` on `chfx.0.03.mix`, play through the transport, assert `SongFxRuntime.setParam` received
  the point value at that row (sentinel call count 1 for that row).

Automated: `npm run type-check`; affected vitest files only.

Manual (owner): draw, stamp, record a knob in each mode, copy/paste a block, undo.

---

### P6 Sends, macros, scenes

Changes:

- P6-01 Send presets: `role: 'send'` preset owns a bus. Extend `engine/SendBusManager.ts` from fixed
  `NUM_SEND_BUSES = 4` to one bus per send preset; `SendBusState` (`useMixerStore.ts:868`) and its actions
  (:1397-1465) move into `useSongEffectsStore.sendAmounts` + send presets; migration step in
  `migrateToSongEffects` moves `mixer.sendBuses` into send presets.
- P6-02 WASM engines tap through the dub output pattern (`set_channel_dub_send` path, `DubBus.registerChannelTap`
  analogue) so sends work on every engine after P3.
- P6-03 `8B xx` sets send amount from the channel to the selected send preset.
- P6-04 Macros: editor section in `FxChainEditor` (8 macros, each up to 8 targets with min/max, `Knob` per
  macro, useRef pattern per `docs/CONTROL_PATTERNS.md`); router keys `chfx.<chain>.<preset>.macroN`.
- P6-05 Scenes: panel with 8 scene slots (store, recall, arm target), stored in `songEffects.scenes`; `8C xx`
  and `scene.morph` lane interpolate every captured key from source to target.
- P6-06 MCP: `set_fx_send`, `set_fx_macro`, `store_fx_scene`, `morph_fx_scene`.

Tests:

- P6-07 Macro mapping unit test (min/max, multiple targets).
- P6-08 Scene morph unit test (0, 0.5, 1; source update on reaching 1).
- P6-09 Migration test: `mixer.sendBuses` to send presets.
- P6-10 Reachability: `src/engine/__tests__/songFxSendMorphReachesPlayback.test.ts`. Song with `8B80` and
  `8C80` on channel 0, play through the transport; assert send gain 0.5 on the bus and scene keys at midpoint
  (sentinels: `applyCommand` call count per code).

Automated: `npm run type-check`; affected vitest files only.

Manual (owner): send a channel to a reverb preset, sweep a macro knob, morph between two scenes during play.

---

### P7 Browser, cards, meters, A/B, tempo sync

Changes:

- P7-01 Searchable browser `src/components/effects/FxBrowser.tsx` over `src/constants/unifiedEffects.ts`
  (`searchEffects` helpers): categories, favourites, recent (persisted in a versioned localStorage key).
- P7-02 Hover preview (D14): after 300 ms, only while playing, temporarily inserts the effect on the selected
  channel through `SongFxRuntime.preview(channel, type)`; nothing written to any store; removed on leave.
- P7-03 Cards in `FxChainEditor`: drag reorder, wet/dry `Knob`, bypass `Toggle`, A/B buttons (`Button`).
- P7-04 A/B (D15): two param snapshots per card in `preset.ab`; switching applies the snapshot.
- P7-05 Per-effect meters: input/output level per card from analysers (reuse `MasterEffectsChain.ts:518` analyser
  pattern and `EffectVisualizer` components).
- P7-06 Level-matched bypass (D15): RMS over last 2 s, gain applied while bypassed, built on
  `engine/factories/effectGainCompensation` and `AutoGainController.ts`.
- P7-07 Tempo sync in rows/beats: extend `BpmSyncControl` and `EffectParameterEngine.ts:1242`
  `applyBpmSyncedParam` with a `rows` unit from the song speed.

Tests:

- P7-08 Unit: preview writes no store state (store snapshot equal before/after); A/B snapshot swap; RMS match
  gain within 0.5 dB on a test signal; rows sync value at speed 6 / 125 BPM.
- P7-09 Reachability: `src/components/effects/__tests__/fxBrowserReachesChain.test.tsx`. Pick an effect in
  `FxBrowser`, change its wet `Knob`, play; assert node exists on the channel chain and wet reached the node
  (sentinel `SongFxRuntime.setParam` call count).

Automated: `npm run type-check`; affected vitest files only.

Manual (owner): browse, hover preview while playing, A/B, bypass level match by ear, delay synced to rows.

---

## Constraints

- Design-system components only (`Button`, `Modal`, `CustomSelect`, `Knob`, `Toggle`); token classes from the
  allowlist; full English labels; no emoji.
- Knob handling per `docs/CONTROL_PATTERNS.md` (useRef config, `paramKey` on every MIDI-drivable knob).
- Debug with the DEViLBOX MCP in real Chrome, never Playwright; stop playback after every MCP test.
- Test runs capped (`nice -n 19`, `--maxWorkers=2`), affected files only.
- Commit by path to main; batch pushes.
