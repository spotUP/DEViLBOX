---
date: 2026-10-18
topic: Per-channel instances for standalone native synths (SYNTH-MUTE-SOLO)
status: approved
research: thoughts/shared/research/2026-10-18_synth-per-channel-instances.md
ledger: thoughts/spot/todos.md (SYNTH-MUTE-SOLO)
---

# Per-channel instances for standalone native synths

## Problem

A song whose channels all play native synths (TB303, TR808, V2, DX7, ...) ignores the
mixer: channel volume, pan, channel effects and the strip filter never touch the audio,
and mute only works because the replayer skips new note-ons. Root cause
(research §2-§4): every type in the `isWASMSynth` list is keyed `(id, -1)`, one instance
per instrument shared by every channel, and its effect chain ends in `synthBus`, not the
per-channel `Tone.Channel` strip (`ToneEngine.ts:1780-1784`, `InstrumentEffectsChain.ts:45-60`).

## Decisions (owner, 2026-10-18)

1. Instance per channel for standalone native synths.
2. Pooled Amiga per-note types (one engine singleton, fixed player-handle pool) stay one
   instance per instrument in phase 1. Documented exemption; see research §10.
3. Routing: `chain.output -> per-channel synth lane (Gain + PitchResampler) -> strip input`.
   `setSynthBusPitchRate` fans `set-rate` out to every lane; the lane gain mirrors the
   synth-bus dB from `_applyBusGains`; worklet passes through at rate 1.

## Finish line

A test drives `ToneEngine.triggerNote(id, note, 0, t, 1, tb303Config, false, false, ch)`
and proves the TB303 instance for channel `ch` is keyed per channel, its chain output is
wired into `getChannelOutput(ch).input` through a lane, and `setMixerChannelVolume(ch, -12)`,
`setChannelMute(ch, true)` and `setSynthBusPitchRate(0.5)` reach that audio. Pooled,
whole-song, MAME, Furnace and preview (channel >= 100) instances still key `-1` and still
reach `synthBus`. `npm run type-check` clean. Owner confirms mute/solo/volume on the
synth-only song at http://localhost:5174 (LOCAL).

## Phase 1 — Type classification and key split

### 1a. New leaf module `src/engine/perChannelNativeSynths.ts`

```ts
/**
 * Native synths that get ONE INSTANCE PER TRACKER CHANNEL so the per-channel
 * mixer strip (volume, pan, mute, channel effects, strip filter) can reach them.
 * ... (why: SYNTH-MUTE-SOLO; pooled types exempt because their engine owns a
 * fixed player-handle pool shared by every instance of the type)
 */
export const PER_CHANNEL_NATIVE_SYNTH_TYPES: ReadonlySet<string> = new Set([
  'TB303', 'Buzz3o3', 'V2', 'V2Speech', 'Sam', 'DECtalk', 'PinkTrombone', 'DubSiren',
  'SpaceLaser', 'Synare', 'TR808', 'TR909', 'WaveSabreSynth', 'OidosSynth',
  'TunefishSynth', 'MdaEPiano', 'MdaJX10', 'MdaDX10', 'Amsynth', 'RaffoSynth', 'CalfMono',
  'SetBfree', 'SynthV1', 'TalNoizeMaker', 'Aeolus', 'FluidSynth', 'Sfizz', 'ZynAddSubFX',
  'Monique', 'VL1', 'DX7', 'OpenWurli',
]);
/** Pooled Amiga per-note replayers: one engine singleton, fixed player pool. Shared. */
export const POOLED_NATIVE_SYNTH_TYPES: ReadonlySet<string> = new Set([
  'SonicArrangerSynth', 'InStereo2Synth', 'InStereo1Synth', 'SoundMonSynth', 'SidMonSynth',
  'DigMugSynth', 'DeltaMusic1Synth', 'DeltaMusic2Synth', 'FCSynth',
  'TFMXSynth', 'FredSynth', 'HippelCoSoSynth', 'RobHubbardSynth', 'HippelStSynth',
  'StartrekkerAMSynth', 'OctaMEDSynth', 'DavidWhittakerSynth', 'SunTronicSynth',
]);
/** Pure: channels to instantiate for one instrument, `[undefined]` = shared key. */
export function perChannelInstanceChannels(synthType: string | undefined, used: ReadonlySet<number> | undefined): Array<number | undefined>;
export const isPerChannelNativeSynthType = (t: string | undefined): boolean =>
  !!t && PER_CHANNEL_NATIVE_SYNTH_TYPES.has(t);
```

`WAM` stays shared (`isWAM` branch, module-per-instance cost) — note in the module.
`MAMEVASynth` is MAME-classified (`isMAME`) and stays shared. `MusicLineSynth`,
`SteveTurnerSynth` are whole-song players (`WHOLE_SONG_SYNTH_TYPES`), not pooled per-note
types; `SidMon1Synth` is not a `SynthType`. None of the three is in either set.
`OPL3` stays a singleton with `setChannel`.

### 1b. `ToneEngine.getInstrument` (`src/engine/ToneEngine.ts:1858-1945`)

- Hoist `isTrackerChannel` / `isLiveVoiceChannel` above the key computation.
- `const isPerChannelNative = isTrackerChannel && isPerChannelNativeSynthType(config.synthType);`
- `isSharedType = (... existing ...) && !isPerChannelNative`.
- Key: per channel when `!isSharedType`, as today. Per-channel native instances never take
  the legacy `-1` reuse branch (`1934`): add `|| isPerChannelNative` to the skip condition,
  so the preview instance is never stolen by a tracker channel.
- Preview / live (`channelIndex` undefined, `-1`, or `>= 100`) keep `-1`.

### 1c. Preload (`ToneEngine.ts:1034-1230`, `src/lib/song/applySong.ts:224`, `src/engine/dj/DeckEngine.ts:654`)

Per-channel instances must exist before the first row plays, or the first note on each
channel loads a WASM mid-song. Add an optional usage map:

```ts
public async preloadInstruments(configs: InstrumentConfig[], usage?: ReadonlyMap<number, ReadonlySet<number>>): Promise<void>
```

- New pure helper `src/lib/song/instrumentChannelUsage.ts`:
  `instrumentChannelUsage(patterns: Pattern[]): Map<number, Set<number>>` — scans every
  cell, records `(instrument id -> channels it plays on)`. Unit test with a 2-pattern song.
- `applySong.ts:224` and `DeckEngine.ts:654` pass `instrumentChannelUsage(song.patterns)`.
- In preload, for each config whose type `isPerChannelNativeSynthType`: create
  `getInstrument(id, config, ch)` for every channel in `usage.get(id)` and await its
  `ensureInitialized`; create the `-1` instance only when the instrument has no usage
  entry (keeps the preview instance for unused instruments). All other types unchanged.
- The dispose-before-create loop (`1050`) already goes through `disposeInstrument(id)`
  (all keys). The `ensureInitialized` wait loops (`1145`, `1200`, `1218`) iterate every
  key of the id via a new private `instancesOf(instrumentId)` helper (returns the array
  of instances; the plan's earlier `forEachInstance` name became this).
- `ensureWASMSynthsReady(configs, usage?)` (DeckEngine calls it after preload) takes the
  same usage map and creates/awaits the same per-channel instances.
- Instance channel choice lives in the pure `perChannelInstanceChannels(synthType, used)`
  so Phase 1 tests cover it without an engine harness: live-voice channels (100+) are
  filtered out; an empty result falls back to `[undefined]` (the shared key).

### Phase 1 automated checks

- `src/engine/__tests__/perChannelNativeSynthKeys.test.ts`: `PER_CHANNEL_NATIVE_SYNTH_TYPES`
  and `POOLED_NATIVE_SYNTH_TYPES` are disjoint; neither intersects `WHOLE_SONG_SYNTH_TYPES`;
  every name in both sets is a synth the engine builds: a `SynthRegistry.knows` entry
  (after importing `registry/builtin` and `registry/sdk`) or a `case '<Type>':` of the
  `getInstrument` switch in `ToneEngine.ts`. `perChannelInstanceChannels` cases.
- `instrumentChannelUsage` unit test.
- `npm run type-check`.

## Phase 2 — Routing: per-channel synth lane

### 2a. Lane store and worklet module cache (`ToneEngine.ts`)

```ts
interface ChannelSynthLane { gain: Tone.Gain; resampler: AudioWorkletNode | null }
private channelSynthLanes: Map<number, ChannelSynthLane> = new Map();
private _synthPitchRate = 1;
private pitchResamplerModule: Promise<boolean> | null = null; // addModule once
```

- Split `initPitchResampler` (`1491-1513`): `ensurePitchResamplerModule()` caches the
  `addModule` promise (resolves `false` on failure); `initPitchResampler` awaits it, then
  inserts the bus node as today. Factor `createPitchResamplerNode(): AudioWorkletNode`.
- `getChannelSynthLane(ch)`: lazy. `gain = new Tone.Gain(synthLinearGain)`; connect
  `gain -> getChannelOutput(ch).input` immediately (so audio flows before the worklet is
  ready); then `void ensurePitchResamplerModule().then(ok => { if (!ok || lane.resampler) return;
  const node = createPitchResamplerNode(); node.port.postMessage({ type: 'set-rate', rate: this._synthPitchRate });
  native(gain).disconnect(native(input)); native(gain).connect(node); node.connect(native(input)); lane.resampler = node; })`.
- `setSynthBusPitchRate(rate)` (`1521`): store `_synthPitchRate`; post to
  `pitchResamplerNode` and to every lane with a resampler.
- `_applyBusGains()` (`1342`): also `lane.gain.gain.value = synthLinear` for every lane.
- `disposeChannelSynthLanes()` called from the engine's `dispose()` and from wherever
  `channelOutputs` are torn down (`disposeAllChannelOutputs` or equivalent — find the
  one place that disposes strips and add the lanes there, so a lane never outlives its strip).

### 2b. Destination by channel

`getInstrumentOutputDestination(instrumentId, isNativeSynth, channelIndex = -1)` (`1780`):
override first; then `isNativeSynth && channelIndex >= 0 && channelIndex < 100
  ? this.getChannelSynthLane(channelIndex).gain : (isNativeSynth ? this.synthBus : this.masterInput)`.

`InstrumentEffectsChain.ts`:
- Context gains `channelFromKey: (key: number) => number` (ToneEngine: `const ch = key & 0xFFFF; return ch === 0xFFFF ? -1 : ch;`, sibling of `instrumentIdFromKey`).
- `buildInstrumentEffectChain` (`64-125`) computes `const channel = ctx.channelFromKey(key)` and passes it to `ctx.getInstrumentOutputDestination(instrumentId, isNativeSynth, channel)` in both the no-effects and the effects path.
- `connectToDestWithFilter(output, dest, isNative, instrumentId, channel)`: the
  per-instrument filter slot `NATIVE_SYNTH_FILTER_BASE + instrumentId` exists because native
  synths bypassed the strip; a per-channel chain (`channel >= 0`) goes through the strip's
  own channel filter, so it connects `output -> dest` directly. Only `channel === -1`
  native chains keep the instrument slot. (Driver check: `NATIVE_SYNTH_FILTER_BASE` has no
  other user in `src/` — the slot is only wiring, nothing writes cutoff to it by that id.)
- `_instrFxCtx` (`5227`) forwards the new channel argument and `channelFromKey`.

### 2c. Native connect on trigger

`createVoice` path (`3952-3958`) is unchanged: native synth audio still flows via the
effect chain; the chain now ends in the lane. `routeNativeEngineOutput` (`2650`) is for
chip engines (Furnace) and stays on `synthBus`.

### Phase 2 automated checks

- `src/engine/tone/__tests__/instrumentEffectChainChannelLane.test.ts` (harness as
  `instrumentEffectChainDispose.test.ts`): building a chain for key `(7 << 16) | 3` with a
  native synth calls `getInstrumentOutputDestination(7, true, 3)`; key `(7 << 16) | 0xFFFF`
  calls it with `-1` and keeps the instrument filter slot; key with channel 3 does NOT
  call `getChannelFilterManager().getInput(1007)`.
- `src/engine/__tests__/perChannelNativeSynthRouting.test.ts` — the reachability test
  (Phase 5).
- `npm run type-check`.

## Phase 3 — Every instrument-wide operation reaches every instance

Replace single `-1` lookups with iteration where the operation is per instrument, not
per channel. Helper in ToneEngine:

```ts
private instancesOf(instrumentId: number): Array<Tone.ToneAudioNode | DevilboxSynth>  // Phase 1
private instanceKeysOf(instrumentId: number): number[]                                 // Phase 3, when the key is needed
```

Same helper exported from `SynthParameterUpdates.ts` for its context (the
`updateWAMParameters` pattern at `26-40`).

Sites and what to do:
- `InstrumentEffectsChain.rebuildInstrumentEffects` (`178-200`): rebuild every key of the id. Keep the "not yet created" early return when there are no keys.
- `instrumentEffectNodes` entry key becomes `` `${key}:${config.id}` `` (`172`); `releaseEffectChain` (`287-300`) already deletes by node membership. `MasterEffectsChain.ts:594-599` `updateInstrumentEffectParams(effectId)` — look up every entry whose key ends with `:${effectId}` and apply to each (one effect config, several chains).
- `ToneEngine.ts:4899`, `4965` (post-render chain restore): rebuild with the real key of the instrument that was rendered (the render path picks an instrument; keep its key in scope and rebuild that key). Find the key once at the top of each function.
- `disposeInstrumentAnalyser` (`2720`): analysers are per instrument id; keep as is, but
  detach from every chain (it already loops? verify; if single, iterate).
- `applyAutomation` (`2795`), `releaseNote` (`3714`, `3740`), `applySynthVolume` (`5647`), `applySynthPan` (`5716`), `applySynthPitch`, `applySynthFrequency` (`5799`), `getBridgeSlotForInstrument` (`3681`): already per-channel-first with `-1` fallback. Unchanged.
- `1726` (`getInstrumentSynthType`), `5015`, `5083` (Furnace only), `3341` (Sampler/Player): shared types. Unchanged.
- `SynthParameterUpdates.ts`: `138-275` MAME only, unchanged. `loadSynthROM` (`301`): DX7 / FluidSynth / Sfizz / OPL3 banks must land on every instance — iterate with the helper (MAME chips still have one instance, the loop is a no-op difference).
- Grep every other `instruments.get(` outside ToneEngine/SynthParameterUpdates for synth-param paths that take an instrument id without a channel (`updateSynthParameter`, `setSynthParam` MCP handler, `useInstrumentStore` live-edit paths, TB303 knob panel `set*`). Each one that targets a per-channel type must iterate. Record the list in this plan under "Phase 3 audit" when done.
- `updateInstrument` (`4709`) disposes by id — every key — then recreates lazily. Unchanged.

### Phase 3 automated checks

- `rebuildInstrumentEffects` test: two keys of one id both get a new chain (extend `instrumentEffectChainDispose.test.ts` harness).
- `updateInstrumentEffectParams` test: one `effectId` across two chains updates both nodes.
- `npm run type-check`.

## Phase 4 — Mute on replayer retrigger paths

`src/engine/TrackerReplayer.ts:2601` and `2617`: add `if (getToneEngine().isChannelMuted(channelIndex)) return;` before `triggerNote`, matching `triggerNote` at `3228-3240`. With the strip in the path mute now cuts sounding notes too; the skip saves a voice.

Test: `src/engine/__tests__/retriggerRespectsMute.test.ts` — static-contract style (as
`synthPlaybackRouting.contract.test.ts`): both callbacks contain the mute guard before
`triggerNote`. (Driving the real callbacks needs the libopenmpt handle; the contract test
is the regression guard; the behaviour is covered live by the owner check.)

## Phase 5 — Reachability test

`src/engine/__tests__/perChannelNativeSynthRouting.test.ts`, harness after
`engineChannelOutputs.test.ts` (mock `tone`, construct `ToneEngine`):

1. Register a fake `TB303` factory that returns a DevilboxSynth whose `output` is a fake
   native node and counts `triggerAttack` (sentinel).
2. `engine.triggerNote(7, 'C4', 0, 0, 1, tb303Config, false, false, 3)`.
3. Assert: sentinel ran once; `engine.instruments` has key `(7 << 16) | 3` and not `(7 << 16) | 0xFFFF`; `connectNativeSynth` was called with the chain output; the chain's destination is `getChannelSynthLane(3).gain`, which is connected to `getChannelOutput(3).input`.
4. `setMixerChannelVolume(3, -12)`: `getChannelOutput(3).channel.volume.value === -12`; `setChannelMute(3, true)`: `.channel.mute === true` (the strip is on the path, so these now gate the synth).
5. `setSynthBusPitchRate(0.5)`: lane resampler `port.postMessage` received `{type:'set-rate', rate: 0.5}`; `setSynthBusGain(-6)`: lane gain is `10^(-6/20)`.
6. Same trigger with `FCSynth` config on channel 3 keys `-1`; TB303 on channel 100 keys `-1`; both destinations are `synthBus`.

Revert check: with Phase 1b reverted the key assertion fails; with Phase 2b reverted the destination assertion fails.

## Manual verification (owner, LOCAL)

`http://localhost:5174`, owner's synth-only song:
1. Play. Mute one channel while a note sounds: it goes silent at once (PASS), not at the next note (FAIL = old behaviour).
2. Solo one channel: only that channel sounds; unsolo restores all.
3. Drag one channel's volume fader: that channel's level follows; pan moves it in the stereo field.
4. Channel effect on a synth channel audibly applies.
5. DJ pitch slider still bends native synths (per-channel lanes + bus).
6. TR808 fires on its channel.

## Risks noted

- 16 channels x one WASM instance each for TB303/TR808-class types: memory and worklet count. Preload with usage map keeps it to channels actually used.
- `synthBusMeter` taps `synthBus` only; per-channel synth audio now bypasses it. The channel meters cover it. If the synth-bus meter is shown somewhere as "all synths", it now reads lower. Noted, not fixed in this plan.
- Speech synths (`Sam`, `V2Speech`) render text asynchronously per instance; preload renders them per channel now (`speechConfigs` loop must go through the usage map too).

## Implementation record (2026-10-18)

All five phases implemented; `npm run type-check` clean; every new test fails when its
phase is reverted. Deviations from the plan above, in phase order:

### Phase 2 deviations
- Lane bookkeeping extracted to `src/engine/tone/ChannelSynthLanes.ts` (create / get / set
  rate / set gain / dispose) instead of growing `ToneEngine` inline. `ToneEngine` owns one
  instance and forwards `setSynthBusPitchRate` and `setSynthBusGain` to it.
- Analyser tap: the per-instrument analyser is connected as a parallel tap off the chain
  output, not inline before the lane. The previous inline wiring doubled the measured
  native level once a strip was on the path; a parallel tap reads once.
- Post-render chain restore (`ToneEngine.ts` ~4975 / ~5041) keeps the shared key: the
  render path resolves the instrument without a channel, so the shared key is the instance
  it rendered with. Verified, no change.

### Phase 3 audit
Every `instruments.get(` outside the helper was checked:
- `InstrumentEffectsChain.rebuildInstrumentEffects`, `MasterEffectsChain.updateInstrumentEffectParams`,
  `SynthParameterUpdates.loadSynthROM`: now iterate every instance key (exported
  `instanceKeysOf`, registry key `instrumentEffectNodeKey(chainKey, effectId)`).
- `useInstrumentStore` DX7 live path (sysex, VCED, bank, program): iterates
  `engine.instancesOf(id)` typed as `DX7LiveSynth` (was a hand-rolled first-match scan).
- `DX7Controls.handleFile`: bulk and single-voice sysex load on every instance.
- `SynthTypeDispatcher.handleSfizzLoadFiles`: SFZ file set loads on every instance.
- MAME single lookups (`SynthParameterUpdates.ts` 138-275), `getInstrumentSynthType`,
  Furnace and Sampler lookups: shared types, unchanged.
- `ToneEngine` per-channel-first lookups with `-1` fallback (`applyAutomation`,
  `releaseNote`, `applySynthVolume` / `Pan` / `Pitch` / `Frequency`,
  `getBridgeSlotForInstrument`): already correct, unchanged.
- `disposeInstrumentAnalyser` (~2837) looks up the shared key only. Analysers are per
  instrument id, so the per-channel chains detach through `releaseEffectChain`; pre-existing
  and minor, left as is.
- `ToneEngine.instancesOf` is now public for the three UI/store call sites above.

### Phase 4 deviation
One shared `TrackerReplayer.isChannelMuted(channelIndex)` (DJ decks: `channelMuteMask`
bit; tracker: `getToneEngine().isChannelMuted`) replaces the three inline checks: row
trigger, `retriggerNote` and `triggerDelayedNote`. The contract test asserts the guard in
both callbacks and the method body.

### Phase 5 deviation
`perChannelNativeSynthRouting.test.ts` installs the fake TB303 factory on the engine
prototype rather than through fake state, and asserts the lane and strip wiring. Strip
volume and mute assertions live in the mixer and lane unit tests (`useMixerStore.test.ts`,
`channelSynthLanes.test.ts`); the routing test proves the strip is on the path.
`instrumentEffectChainDispose.test.ts` context gained `channelFromKey` and
`instrumentOutputOverrides`, which `connectChainOutput` now requires.

### Tests added
`perChannelNativeSynthKeys.test.ts`, `instrumentChannelUsage.test.ts`,
`channelSynthLanes.test.ts`, `connectChainOutput.test.ts`,
`perChannelNativeSynthRouting.test.ts`, `instrumentEffectsPerInstance.test.ts`,
`retriggerRespectsMute.test.ts`.
