---
date: 2026-10-18
topic: Per-channel instances for native (DevilboxSynth) instruments so channel volume, pan, mute and channel effects reach them
status: draft
---

# Synth per-channel instances: what exists today

Trigger: owner bug SYNTH-MUTE-SOLO ("mute and solo dont work in my song with only synths"). Root cause (ledger round 3): shared synth types use ONE instance per instrument (key channel -1), whose output goes instrument effect chain -> synthBus, never through the per-channel Tone.Channel strip. Owner decision 2026-10-18: one instance per tracker channel that plays the instrument. This document records what IS; the plan lives in `thoughts/shared/plans/2026-10-18-synth-per-channel-instances.md`.

Sections 1-8 are the research agent's map (session scratchpad `synth-per-channel-map.md`), sections 9-11 were added after reading the cited ranges directly. Anything marked UNCONFIRMED was not read; the note says where to look.

# Shared synth -> per-channel instance: code map

Paths relative to /Users/spot/Code/DEViLBOX/src. Line numbers verified by read or grep. "UNCONFIRMED" = not read.

## 1. Lifecycle of a shared DevilboxSynth
- Shared-type decision: engine/ToneEngine.ts:1857-1885. isWASMSynth list 1865-1883 (comment: avoid exhausting fixed player-handle pools across channels). isVSTBridge 1884 = !isWASMSynth && SYNTH_REGISTRY.has(type). isSharedType 1885 = Sampler, Player, SunVoxSynth, MAME, Furnace, Buzz, WASM, WAM, VSTBridge.
- Key: getInstrumentKey(id,-1) for shared (1886-1888). id recovered by instrumentIdFromKey (key>>>16).
- Cache hit + stale-type dispose: 1894-1920. FP/JC pointer refresh 1905-1913.
- Per-channel only for Tone.js types: needsPerChannelInstance = isTrackerChannel(0..99) && isToneJSSynth (1928-1930). Live voices (>=100) 1927.
- Aliased singletons: FuturePlayer/JamCracker/MaxTrax/PreTracker reuse one instance under new keys 1945-1966; OPL3 1970-1989 (setChannel(ch%18)).
- Stored: instruments.set(key) 2598; instrumentSynthTypes 2608-2610.
- Output: every non-SunVoxModular instrument gets buildInstrumentEffectChain(key, effects, instrument) 2636-2644 (tracked in pendingEffectChains). SunVoxModular connects worklet straight to synthBus once, no chain (2612-2632). routeNativeEngineOutput 2652.
- buildInstrumentEffectChain: engine/tone/InstrumentEffectsChain.ts:64-160. Disposes existing chain for key; output = Tone.Gain(1). No effects: ctx.connectNativeSynth(instrument.output, output). Effects: via bridge Tone.Gain -> effects -> output. Destination = analyser input if active, else ctx.getInstrumentOutputDestination(id, isNative).
- Native node exposed: DevilboxSynth.output (AudioNode), src/types/synth.ts. Unwrapped by getNativeAudioNode, utils/audio-context.ts:199. connectNativeSynth ToneEngine.ts:580-612 (MediaStream bridge on context mismatch).
- getInstrumentOutputDestination ToneEngine.ts:1780-1784: instrumentOutputOverrides entry if present, else isNative ? synthBus : masterInput. Field 406; passed into contexts 5232, 5388; cleared in disposeAllInstruments 4635. Setters setInstrumentOutputOverride/remove: InstrumentEffectsChain.ts:222-240 (DJ deck routing). ChannelRouting.createVoice (~273) also honours override.
- Native synths also pass connectToDestWithFilter (InstrumentEffectsChain.ts ~45-60): channel filter manager slot NATIVE_SYNTH_FILTER_BASE + instrumentId = per-INSTRUMENT filter, not per tracker channel.

## 2. Parameter fan-out
Already iterate every key of the id (instrumentIdFromKey(key)===id), engine/tone/SynthParameterUpdates.ts: updateWAMParameters 28, updateTB303Parameters 60, updateFurnaceInstrument 89, updateHarmonicSynthParameters 118, updateDubSirenParameters 349, updateSpaceLaserParameters 367, updateV2Parameters 380, updateSynareParameters 517, updateFurnaceParameters 531, updateComplexSynthParameters 544, updateToneJsSynthInPlace 558-575 (how Tone.js per-channel instances update today), updateNativeSynthConfig 709-720 (all Amiga synths via updateConfig).
Use only the -1 key (must be changed to iterate): getMAMESynthHandle 137, getMAMEChipSynth 150, updateMAMEChipParam 184, loadMAMEChipPreset 199, updateMAMEChipTextParam 249, speakMAMEChipText 274, loadSynthROM 300. UNCONFIRMED (not read): updateMAMEParameters 168, updateBuzzmachineParameters 580, updateTB303Pedalboard 597, chip arpeggio fns 651-682.
Other -1-only sites in ToneEngine.ts: preload dispose/init/warmUp loops 1050, 1145, 1200, 1218; applyAutomation fallback 2795; slice player 3341; release fallback 3681-3753; render-offline effect-chain rebuilds 4899, 4965; synthType lookups 5015, 5083; applySynthVolume fallback 5647 (also 5716, 5799 UNCONFIRMED).
Effects: rebuildInstrumentEffects (InstrumentEffectsChain.ts ~165) uses only -1 and disconnects instrument.output wholesale. Effect node registry ctx.instrumentEffectNodes is keyed by effect config.id (~155): per-channel chains of one instrument would overwrite each other's entries -> collision for updateInstrumentEffectParams.
updateInstrument ToneEngine.ts:4709-4713: disposeInstrument(id) then getInstrument(id, config) with no channel: recreates the -1 key only; per-channel recreated lazily on next trigger.
Analyser: getInstrumentAnalyser 2715, disposeInstrumentAnalyser ~2740-2770 loop instrumentEffectChains by key>>16 (already multi-key).

## 3. Dispose paths
- disposeInstrumentByKey 4572-4607: single key; deletes instruments, synthTypes, loadingPromises, pendingEffectChains; release; disposeInstrumentEffectChain(key); instrument.dispose().
- disposeInstrument(id) 4609-4621: loops ALL keys with instrumentIdFromKey===id. Already multi-key. Caveat: aliased singleton keys (FP/JC/MaxTrax/PreTracker/OPL3) dispose the same object repeatedly (harmless? UNCONFIRMED per synth dispose idempotence).
- disposeAllInstruments 4626-4660: all keys, clears maps and instrumentOutputOverrides.
- invalidateInstrument 4665 -> disposeInstrument.
- Gap: per-channel strip routing needs disposal of any per-instance strip connection (connectNativeSynth link) - done by instrument.dispose + chain dispose only if the link lives in the chain.

## 4. Classification
(b) Whole-song replayer engines (own per-channel mute/gain; ONE instance is the entire mix): engine/wholeSongSynths.ts:25-40 WHOLE_SONG_SYNTH_TYPES (HivelySynth, UADESynth/UADEEditableSynth, SonixSynth, TFMXModuleSynth, KlysSynth, Cinter4Synth, FuturePlayer, JamCracker, MaxTrax, PreTracker, SunTronicSongSynth, V2MSynth, Zxtune, Sc68, Gme, S98, Nuade, etc. ~75 types). Header comment line 7: "One synth instance is shared by every channel of the song". Test engine/__tests__/wholeSongSynths.test.ts. Must NOT go per-channel.
 Mute/gain bridge: stores/useMixerStore.ts getActiveGainEngine 565-583 (Hively, Klys, Cinter4 globals + _gainEngineCache); forwardWasmChannelGain 646-692 (Furnace dispatch mute(ch); SunVox _sunVoxMuteBridge; classic formats mute-mask only; else setChannelGain).
 Furnace: dispatch engine, singleton-per-song with per-channel mute (useMixerStore 646-692). MAME chips: one chip emulator, multi-voice internally (UNCONFIRMED instance cap). Buzz: Buzzmachine, per instrument instance (UNCONFIRMED). SunVoxSynth/SunVoxModular: SunVoxEngine singleton output (ToneEngine 2612).
(a) Standalone instruments that can be instantiated several times: the isWASMSynth list entries that are NOT in WHOLE_SONG_SYNTH_TYPES, i.e. per-note synths (TB303, Open303/Buzz3o3, DX7, OPL3 caveat, MdaEPiano/JX10/DX10, Amsynth, Raffo, Calf, SetBfree, SynthV1, TalNoizeMaker, Aeolus, FluidSynth, Sfizz, ZynAddSubFX, Monique, VL1, V2, Dub siren, SpaceLaser, Synare, Geonkick, WAM plugins, VSTBridge). Exact set = isWASMSynth list ToneEngine.ts:1865-1883 minus wholeSong list (needs a set diff - UNCONFIRMED, do it from the two lists).
Explicit singletons (instance hard-shared): FuturePlayer, JamCracker, MaxTrax, PreTracker (ToneEngine 1945-1966), OPL3 (1970-1989), Geonkick (engine/registry/builtin/geonkick.ts:4 wraps singleton GeonkickEngine), SunVoxModular (2612).
NATIVE_POLY_TYPES (ToneEngine 3488-3500) = already natively polyphonic: do not need per-note voice allocation; per-channel instance would multiply polyphony engines.
SYNTH_REGISTRY: engine/vstbridge/synth-registry.ts (UNCONFIRMED: no `singleton` comment found by grep in engine/registry or vstbridge besides geonkick.ts:4).

## 5. Limited instance pools
Worklet player handles (createPlayer/waitForPlayerHandle, warn "Pool full" when handle<0), MAX_PLAYERS: davidwhittaker 8, fc 8, fred 8, robhubbard 8, sidmon 8, sonic-arranger 8, soundmon 8, octamed 16, tfmx 16, hively (HivelyWrapper.c:458) 16, digmug 64, hippel-coso 32, sidmon1 32. Handles are per engine singleton, so (instances x notes) per type is capped by MAX_PLAYERS; 8 channels x 1 instrument fits only 8-pool types barely. Types that cannot be instantiated twice (singleton): FuturePlayer, JamCracker, MaxTrax, PreTracker, OPL3, Geonkick, SunVoxModular. Worklet module loading itself (one AudioWorkletNode per instance) is not capped - UNCONFIRMED.

## 6. Channel strip
- ChannelRouting.getChannelOutput engine/tone/ChannelRouting.ts:186-226. Built lazily on first use: from createVoice (232-236) or mixer setters (deferred via pendingMix; test channelChainsBuiltOnUse.test.ts).
- Chain: input Tone.Gain -> channel effects manager chain -> channel filter manager HPF/LPF -> Tone.Channel (volume/pan) -> meter; channel.connect(ctx.masterInput). Stored ctx.channelOutputs.set(ch,{input,channel,meter}).
- Native AudioNode in: yes, via connectNativeSynth(synth.output, channelOutput.input) (ToneEngine 580-612) / getNativeAudioNode.
- Today: triggerNote -> createVoice (ToneEngine ~3954) builds strip + voice gain/filter/panner -> channelOutput.input, but only non-DevilboxSynth voices get voiceNode.connect(voice.nodes.gain) (comment ~3958 says audio goes via buildInstrumentEffectChain -> masterInput; actually synthBus for native). So native synth: strip exists, nothing flows in.
- Mixer: setMixerChannelVolume 610, setMixerChannelPan 621, setChannelMute 597, disposeChannelOutputs 661.
- Master wiring ToneEngine 495-510: masterInput -> masterEffectsInput; synthBus -> masterEffectsInput (parallel). initPitchResampler ~1487-1510: synthBus -> PitchResampler worklet -> masterEffectsInput.
- Routing through the strip ends at masterInput, so it BYPASSES synthBus, the PitchResampler (DJ pitch/key), the synthBus gain (set_synth_bus_gain) and synthBusMeter (~5519). Needs a decision: strip output into synthBus for native-origin channels, or a separate path.
- Instrument effect chain still sits between synth and strip if routed chain.output -> channelOutput.input via instrumentOutputOverrides-like destination. getInstrumentOutputDestination(id,isNative) has no channel argument (1780-1784): must gain one.

## 7. Preview / live channel indices
- LIVE_VOICE_BASE_CHANNEL = 100 (furnace-dispatch/chipChannel.ts:19; ToneEngine 280, used 545, 1927). Tracker channels 0..99.
- triggerPolyNoteAttack (ToneEngine 3509): native-poly types and TB303/Buzz3o3 -> triggerNoteAttack with channelIndex undefined (3566, 3585) = -1 shared key. Other mono synths -> voiceAllocator.allocate (3602) gives channel >=100 (allocator base at 545). liveVoiceAllocation map 277.
- Callers using triggerPolyNoteAttack (channel undefined/allocated, NOT a tracker channel): hooks/useAutoPreview.ts:89 (instrument-editor auto preview, PREVIEW_NOTE C4), stores/useMIDIStore.ts:518,537 (live MIDI), TestKeyboard.tsx:220,228, SamplePackBrowser.tsx:167 and LoadPresetModal.tsx:143,245,269 (instrument id 999), hooks/tracker/input/useNoteInput.ts:136.
- triggerNoteAttack direct, channelIndex omitted (-1 key): InstrumentList.tsx:141,294, DrumKitEditor.tsx:149, useMIDIPadRouting.ts:560, useNavigationInput.ts:73, playRow.ts:38, tourScript.ts:374,414, bridge writeHandlers.ts:1498,1501,2053,2254.
- Tracker playback passes real channelIndex: TrackerReplayer.ts:2601,2617,3358,3382; PatternScheduler.ts:650,724 (UNCONFIRMED whether it passes channel arg).
- Voice-to-notes: bridge/handlers/voiceHandlers.ts takes channelIndex = params.channel ?? cursor.channelIndex (line 71) for WRITING cells; preview audition path UNCONFIRMED (components/tracker/VoiceToNotesPanel.tsx, hooks/audio/useVoiceRecorder.ts not read).
- Rule for per-channel: key per-channel only when 0<=ch<100 (as isTrackerChannel does 1928); previews/MIDI keep -1 or >=100 -> no multiplication. Existing Tone.js code already follows this.

## 8. Tests
- engine/tone/__tests__/channelChainsBuiltOnUse.test.ts: strip built lazily.
- engine/tone/__tests__/instrumentEffectChainDispose.test.ts: chains for native synths.
- engine/tone/__tests__/synthPitchEffectsBendToneVoices.test.ts:50 getInstrument(id,cfg,100); toneEngineFeedsTheVoiceProbe.test.ts:32 (ch 100); toneVoiceProbe.test.ts.
- engine/__tests__/furnaceKeySpamChannel.test.ts (LIVE_VOICE_BASE_CHANNEL).
- engine/__tests__/wholeSongSynths.test.ts:11 (documents "single shared instance" for replayers); stores/__tests__/sonixSynthLiveEdit.test.ts:6 (earlier fix updated only the shared instance).
- engine/__tests__/phase4StandaloneSynths.contract.test.ts (worklet exposes createPlayer/noteOn/noteOff).
- grep for `isSharedType` / `needsPerChannelInstance` finds NO test asserting them (only ToneEngine.ts and non-test files). No test asserts shared-instance behaviour of getInstrument directly (UNCONFIRMED beyond the grep list: sonixSynthLiveEdit, wholeSongSynths mention it only in comments).

## 9. Global pitch path and where strip-routed native audio terminates

Read directly: `src/engine/PatternScheduler.ts:138-178`, `src/engine/ToneEngine.ts:1336-1347, 1487-1525, 1531-1560, 1780-1784`, `src/engine/tone/ChannelRouting.ts:186-226`, `public/pitch-resampler/PitchResampler.worklet.js`.

- `PatternScheduler.applyPitchState` (138-178) splits the DJ global pitch with `computeTempoPitchSplit(globalPitch, trackerKeyLock)` into a tempo rate and a pitch rate. Tempo: `replayer.setTempoMultiplier`. Samples: `engine.setGlobalPlaybackRate(pitchRate)` + `replayer.updateAllPlaybackRates()`. Tone.js synths: `engine.setGlobalDetune(cents)` (ToneEngine 1531-1560: only non-DevilboxSynth active voices with a `.detune` signal; PolySynth via `set({detune})`). Whole-song native engines: `applyNativeEnginePitch(tempoRate, pitchRate)` (`src/engine/replayer/nativeEnginePitch.ts:64-73`, returns `ownsSynthBus`). Then `engine.setSynthBusPitchRate(nativeOwnsBus ? 1 : pitchRate)`.
- `setSynthBusPitchRate` (1520-1525) posts `{type:'set-rate', rate}` to the ONE `pitchResamplerNode`. `initPitchResampler` (1487-1513) rewires `synthBus -> resampler -> masterEffectsInput`. So every per-instrument native synth (TB303, TR808, V2, ...) gets DJ pitch ONLY through the synthBus resampler; there is no source-domain pitch for them (TR808/TR909 have no `setFrequency`; `applySynthFrequency` 5793-5812 serves tracker pitch effects, not DJ pitch).
- Worklet facts: 8192-sample stereo ring (`bufSize = 8192`, ~170 ms at 48 kHz, line 17-18); at `rate === 1.0` it copies input to output (line 59, zero added latency). Latency only appears when shifted.
- Synth bus gain: `setSynthBusGain(db)` 1336 -> `_applyBusGains()` 1342-1347 writes `masterInput.gain` (sample dB + autoGainSampleCorr) and `synthBus.gain` (synth dB + autoGainSynthCorr). `synthBusMeter` taps synthBus (`getSynthBusLevel` ~5443).
- Channel strip tail (`ChannelRouting.ts:204-208`): `input -> chainInput; chainOutput -> filterInput; filterOutput -> channel; channel.connect(meter); channel.connect(ctx.masterInput)`. The strip ends at `masterInput`, NOT synthBus.
- `getInstrumentOutputDestination(instrumentId, isNativeSynth)` (1780-1784): override map, else `isNative ? synthBus : masterInput`. No channel argument. Callers: ToneEngine 2683, 2763, 2765 (analyser rewire), 3196, 4244, 4295 (sample slice/offset players), 5237 (ctx bridge), `InstrumentEffectsChain.ts:112`.

Consequence: a native synth routed `chain.output -> channelOutput.input` would reach `masterInput` and bypass synthBus, the PitchResampler (DJ pitch for synth songs), the synth-bus dB and `synthBusMeter`. The plan must keep DJ pitch and synth-bus gain for per-channel native synths. Options considered (plan picks one):

| Option | Mechanism | Fails |
|---|---|---|
| A. strip -> masterInput as today | nothing extra | DJ pitch stops moving per-channel synths; synth-bus dB no longer applies to them |
| B. strip output -> synthBus when channel carries a native synth | rewire `channel.connect` per channel | a channel mixing samples and synths double-pitches samples (sample rate + resampler) |
| G. resampler moved over masterInput | one resampler on masterInput | double-pitches samples everywhere |
| O. source-domain pitch via `applySynthFrequency` | like Tone.js detune | drum synths have no frequency; ~40 types unverified |
| Q. lazy per-channel PitchResampler node | `chain.output -> chResampler[ch] -> channelOutput.input`, created only for channels carrying per-channel native synths; `setSynthBusPitchRate` fans `set-rate` to every node; per-channel synth lane gain mirrors the synth dB written in `_applyBusGains` | synthBusMeter does not see strip-routed synths (meter coverage to be re-pointed or documented) |

## 10. Candidate set

`isWASMSynth` list (ToneEngine 1865-1883, 67 types) minus `WHOLE_SONG_SYNTH_TYPES` (`src/engine/wholeSongSynths.ts:25-45`, 70 entries) leaves 53 types, computed with node from both arrays (not by eye):

- Standalone, one worklet/WASM per instance (per-channel is plain): TB303, Buzz3o3, V2, V2Speech, Sam, DECtalk, PinkTrombone, DubSiren, SpaceLaser, Synare, WAM, TR808, TR909, MAMEVASynth, WaveSabreSynth, OidosSynth, TunefishSynth, MdaEPiano, MdaJX10, MdaDX10, Amsynth, RaffoSynth, CalfMono, SetBfree, SynthV1, TalNoizeMaker, Aeolus, FluidSynth, Sfizz, ZynAddSubFX, Monique, VL1, DX7, OpenWurli. Per-instance-ness of each is UNCONFIRMED beyond the standard `DevilboxSynth` constructor pattern; check the engine singleton question per type at implementation time (`grep -n "static.*instance\|getInstance" src/engine/<type>/`).
- Pooled Amiga per-note types (one engine singleton per type, one player handle per synth instance, section 5 caps): SonicArrangerSynth, InStereo2Synth, InStereo1Synth, SoundMonSynth, SidMonSynth, DigMugSynth, DeltaMusic1Synth, DeltaMusic2Synth, FCSynth, TFMXSynth, FredSynth, HippelCoSoSynth, RobHubbardSynth, HippelStSynth, StartrekkerAMSynth, OctaMEDSynth, DavidWhittakerSynth, SunTronicSynth. `FCSynth.ts:53-54` confirms one `createPlayer` per instance with the pool-full sentinel `-1`. Per-channel instances multiply handle use by channels; an 8-pool type with one instrument on 8 channels fills the pool with zero headroom.
- Hard singletons (cannot instantiate twice, section 5): OPL3 (in the candidate set; `setChannel(ch%18)` 1970-1989). Exempt.

Also in the shared set but not WASM-listed and not per-channel candidates: Sampler, Player, SunVoxSynth (whole-song), MAME, Furnace, Buzzmachine, VSTBridge (`isSharedType` 1885). Furnace and MAME each own one chip emulation per instrument; whether a second instance per channel is safe is UNCONFIRMED (not read); treat as shared in phase 1.

## 11. Confirmed since the map

- `SynthParameterUpdates.ts:168` (`updateMAMEParameters`) looks up the `-1` key only; `:580` (`updateBuzzmachineParameters`) iterates every key of the instrument id. Lines 597, 651-682 UNCONFIRMED.
- `applySynthFrequency` (ToneEngine 5793-5812): tries the per-channel key, falls back to `-1`, then `instrument.setFrequency(frequency, rampTime)`; 5714-5718 same fallback.
- `getInstrument(instrumentId, config, channelIndex)` call sites: ToneEngine 3023, 3335, 3883.
- `PatternScheduler.ts:724` passes `channelIndex` to `engine.triggerNote`; TrackerReplayer retrigger paths `src/engine/TrackerReplayer.ts:2601` and `:2617` call `triggerNote(..., channelIndex)` with no mute check; the normal path `TrackerReplayer.triggerNote` 3228-3240 skips on `engine.isChannelMuted(channelIndex)` (tracker) or `channelMuteMask` (DJ deck).
- `instrumentEffectNodes` (`InstrumentEffectsChain.ts:20, 172, 292`) is keyed by effect config id alone; two chains of one instrument (two channels) would overwrite each other's entry.
- Pool constants live in the WASM C sources, not in the worklet JS (`public/fc/FC.worklet.js:5` only mentions `MAX_PLAYERS`); values in section 5 come from the research agent (UNCONFIRMED here).
