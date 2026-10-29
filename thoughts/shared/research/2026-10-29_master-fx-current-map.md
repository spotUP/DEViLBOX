---
date: 2026-10-29
topic: Current master FX and per-channel insert FX implementation (for song effect table migration)
status: research
---
# Master FX and channel insert FX: what IS (paths under src/)

Documentary. Anything marked UNVERIFIED was not opened. About 35 tool calls, grep plus range reads.

## 1. Master FX state and engine
- Store: `stores/useAudioStore.ts:32` `masterEffects: EffectConfig[]`; actions `addMasterEffect` :51/:185, `addMasterEffectConfig` :52/:210, `removeMasterEffect` :221, `updateMasterEffect` :230 (calls `engine.updateMasterEffectParams` :260), `reorderMasterEffects` :285, `setMasterEffects(effects, presetGainCompensationDb)` :292. Also `presetGainCompensationDb`.
- `EffectConfig`: `types/instrument/effects.ts:172`: id, category ('tonejs'|'neural'|wasm|wam), type, enabled, wet 0-100, parameters Record<string, number|string> (numbers 0-100 normalised), neuralModelIndex, sidechainSource, selectedChannels (routes an effect to chosen channels via isolation slots), channelRole 'nonDrums', bass-lock flag (DJ).
- Rebuild trigger: `hooks/audio/usePatternPlayback.ts:54,148-154` memoises `masterChainKey(masterEffects, presetGainCompensationDb)` and calls `engine.rebuildMasterEffects`. Param-only edits skip rebuild (`canUseParameterUpdatePath` MasterEffectsChain.ts:427, `updateEffectParameters` :467, wet ramp 20 ms :490).
- Engine: `engine/tone/MasterEffectsChain.ts`: `rebuildMasterEffects(ctx, effects)` :191 (version guard, builds new chain then tears down old, filters `enabled` :222 so bypass = removed from graph, fallback bypass :371); `updateMasterEffectParams` :526; `getMasterEffectAnalysers` :518 (pre/post AnalyserNode per effect id). Context `MasterEffectsContext` :11 (masterEffectsInput, blepInput, masterEffectConfigs Map, analysers).
- Wiring: `engine/tone/masterFxGraph.ts` `assembleMasterFxGraph` (shared by tracker and DJ mixer): per-effect gain comp (`factories/effectGainCompensation`), optional bass-lock split at 150 Hz (`BASS_LOCK_CROSSOVER_HZ`), preset make-up gain, output. Effects created via `engine/factories/EffectFactory.ts` (`createEffect`, `applyWetGain`).
- Targeted master effects (selectedChannels/channelRole) are routed through `ChannelRoutedEffects` isolation slots, `sidechainKey.ts` resolves roles.
- `midi/performance/parameterRouter.ts:639-646`: only `masterFx.slot0..2.wet|param0`, `masterFx.masterVolume`, `masterFx.limiterCeiling` (type 'config', path `__masterFx__`). Slot-indexed, only 3 slots, one param each.

## 2. Master FX UI
- Components: `components/effects/MasterEffectsPanel.tsx`, `MasterEffectsModal.tsx`, `MasterPresetMenu.tsx`, `masterPresetSearch.ts`, `MasterFxQuantizeSwitch.tsx`, `EffectParameterEditor.tsx` (chooser + Neural editor :108), `InstrumentEffectsPanel/Modal`, `ChannelInsertEffectsModal.tsx`, `BpmSyncControl.tsx`, `EffectVisualizer.tsx` (EffectSpectrum, EffectOscilloscope, GainReductionMeter from pre/post analysers).
- Editors: `components/effects/editors/` index.tsx (re-exports; per-type editor components: Basic, FilterEffect, Dynamics, Vintage, DelayVariant, Specialized, Additional, EQModReverb, DistortionSat, Voice, Rebirth, Aelapse, Fil4Eq, Neural, WAM). Exact type->editor dispatch table not located (UNVERIFIED; look in EffectParameterEditor.tsx / editors/index.tsx).
- `constants/unifiedEffects.ts` (619 lines): `AvailableEffect {category, type?, neuralModelIndex?, label, group, description?}`; `AVAILABLE_EFFECTS` :23; helpers `getEffectsByGroup` :556, `getEffectsByCategory`, `searchEffects`, `getTotalEffectCount`, `getEffectGroups`.
- `constants/fxPresets.ts` (1067): `FxPreset {name, description, tags: FxTag[], effects: Omit<EffectConfig,'id'>[], gainCompensationDb?}` :29; `FX_PRESETS` :42; `MASTER_FX_PRESETS` :1029 derived; `getPresetsByTag/Category`.
- `constants/masterPresetClaims.ts` (718): per-preset "claims" (description promises as measurable metrics: tilt, thd, gr, crest, tail, echo, width, ceil...), checked by offline rig `src/test/audio/masterChainRig.ts` and `masterPresetClaims.test.ts`. Test spec only, not runtime. `LIVE_CLAIMS`, `LIVE_UNVERIFIED`, `liveOnlyReason`.

## 3. Per-channel inserts (two parallel systems)
- State: `stores/useMixerStore.ts` `MixerChannelState.insertEffects: EffectConfig[]` :817 (cap 4 at :1117), `sendLevels: number[]` :818 (4 buses), `dubSend` :819. Actions add/remove/toggle/move/update :1117-1177.
- Tone path: `engine/ChannelEffectsManager.ts` `MAX_CHANNEL_FX_SLOTS = 4` :19; `getOrCreateChain` :38, addEffect :58, removeEffect :76, toggleEffect :91, moveEffect :101, getChainInput :124, getChainOutput :132, updateEffectParams :180 (uses `applyEffectParametersDiff`), disposeAll/Channel. Doc: instrument -> channelGain -> channelPan -> [fx...] -> masterInput.
- WASM path: `engine/tone/ChannelRoutedEffects.ts` `ChannelRoutedEffectsManager`; `scheduleWasmEffectRebuild` (useMixerStore.ts:~93-135) gathers `insertEffects` + routed master effects and calls `mgr.rebuild`. Worklet has 37 outputs: [0] main mix, [1..4] isolation slots (shared pool, `planIsolationSlots` :85, `DEFAULT_ISOLATION_SLOTS`), [5..36] per-channel dub sends (`DUB_OUTPUT_BASE=5`, `dubOutputBase.ts`, engines with bigger pools register a base). Engines: LibOpenMPT, FurnaceDispatch, Hively, UADE implement `IsolationCapableEngine` (:149; `supportsIsolationSlots`, `maxIsolationSlots`, `addIsolation`).
- `engine/tone/ChannelRouting.ts`: `ChannelOutput` (input Gain, voiceDelay, join...), uses `getChannelEffectsManager` (UNVERIFIED rest).
- Send tap answer: YES. Dub send outputs [5..36] are a per-channel tap that does NOT consume an isolation slot (sidechain taps on engines without slots use a "copy tap on the dub-send output", slotIndex -1, ChannelRoutedEffects.ts:203). Engines opt out via `supportsDubSends() === false` (e.g. `engine/pretracker/PreTrackerEngine.ts:483`). Native-context engines: `engine/replayer/NativeEngineRouting.ts:161`. Whether every non-worklet engine has a tap: UNVERIFIED.

## 4. Dub bus send pattern (reuse candidate)
- MCP `set_channel_dub_send` -> `bridge/MCPBridge.ts:348` -> `bridge/handlers/writeHandlers.ts:420` `setChannelDubSend` -> store `setChannelDubSend(ch, amount)` (rAF-batched write, useMixerStore.ts:175-246) -> `ChannelRoutedEffects.setChannelDubSend` :646 -> `_applyDubSend` :653: `dubSendToGain` curve (`lib/dub/dubSendCurve`), `effectiveDubSend` (bleed, `lib/dub/sendAudibility`), per-channel `channelDubGains[ch]` GainNode ramped `DUB_SEND_RAMP_SEC=0.02`, seeded at boot with `DUB_SEND_SEED_RAMP_SEC=0.6`, lazy worklet activation, `bus.registerChannelTap(ch, gain, baseline)` (`engine/dub/DubBus.ts:5930`). Store field `MixerChannelState.dubSend` 0-1.
- ALREADY EXISTING generic send buses: `engine/SendBusManager.ts` (`NUM_SEND_BUSES=4`; returns mix into masterEffectsInput; `getOrCreateSendGainForChannel` :~145 creates `Tone.Gain(0)` per `${channel}-${bus}` fed from the channel node; setBusVolume :76, setBusMute :85, addBusEffect/removeBusEffect :109, getBusInfo :124; init from ToneEngine.ts:578). Store: `SendBusState {name, volume, muted, effects: EffectConfig[]}` useMixerStore.ts:868, default 4 buses 'Send A..D' :875, actions :1397-1465, snapshot restore :1548. Saved in .dbx via `mixer.sendBuses` (snapshotSong.ts:127-131). UI use of send buses: UNVERIFIED (only grep on component names found no direct hit).

## 5. Persistence
- Save shape: `lib/song/snapshotSong.ts:30` `snapshotSong()`: `masterEffects: audioState.masterEffects` :88; `mixer: {channels (includes insertEffects, sendLevels, dubSend), sendBuses}` :127; `dubBus` :132. `presetGainCompensationDb` saved? UNVERIFIED.
- IndexedDB project: `hooks/useProjectPersistence.ts` `SavedProject` :~129-150 (`masterEffects?` :137, `mixer?: MixerSnapshot` :149), `buildSavedProject` :349 stamps `schemaVersion: SCHEMA_VERSION` (= CURRENT_SCHEMA, :125), load gate :464-473 calls `migrateSavedProject`.
- .dbx type: `lib/export/exporters.ts:281` `masterEffects?`, :296 `mixer?: MixerSnapshot`. Mixer snapshot type `MixerSnapshot` useMixerStore.ts:959.
- Schema: `lib/persistence/migrations/index.ts:34` `CURRENT_SCHEMA = 26`, `MIN_LOADABLE_SCHEMA = 21` (:27). Step pattern: `if (fromVersion < N) {...}` inside `migrateSavedProject` (:50-90), ends `project.schemaVersion = CURRENT_SCHEMA`. Example step 23->24: `migrateMixerChannelShape` (same file, ~:95) maps legacy `dubFilterMode/dubFilterHz` to `dubShape/dubShapeValue` on `mixer.channels`. Additive fields do not bump. Other file in dir: `voiceDrumsV2.ts`; tests in `__tests__/`.
- localStorage: no direct persist middleware found in useAudioStore (UNVERIFIED); project state goes to IndexedDB via useProjectPersistence.

## 6. MCP tools (registered in `bridge/MCPBridge.ts`; handlers in `bridge/handlers/writeHandlers.ts`)
add_master_effect (MCPBridge:429 -> writeHandlers.ts:1577), update_master_effect (:1596), remove_master_effect (:431 UNVERIFIED line), toggle_master_effect (:1611), set_master_effects (:1886; test `bridge/__tests__/setMasterEffectsKeepsModel.test.ts`), measure_master_effect (:730), get_channel_effect_slots (:866; reports isolation slots and targeted master effects), set_channel_dub_send (:420). Server side tool schemas: `server/src/mcp/mcpServer.ts`. No MCP tool for channel insert add/remove found (UNVERIFIED).

## 7. Meters, tempo sync, A/B
- Meters: `components/effects/EffectVisualizer.tsx` `GainReductionMeter`, `EffectSpectrum`, `EffectOscilloscope`, fed by `getMasterEffectAnalysers` pre/post AnalyserNodes (MasterEffectsChain.ts:518; `tapWhileSounding` from `engine/audio/signalPresence`). Used in FilterEffectEditors.tsx:9,112,462 (compressors).
- Tempo sync: `engine/tone/EffectParameterEngine.ts:1242` `applyBpmSyncedParam`; params `bpmSync`, `syncDivision` (:1221); `MasterEffectsChain.ts:575` recompute on change; `ctx.updateBpmSyncedEffects(bpm)`; UI `components/effects/BpmSyncControl.tsx`.
- Level matching: `engine/factories/effectGainCompensation` (per-type static dB) + `presetGainCompensationDb`; `engine/tone/AutoGainController.ts` exists (purpose UNVERIFIED). No A/B compare UI found (grep ABCompare/levelMatch in components/effects: none).

## Observations for the plan
- Send buses (4, per-channel levels, return chains, saved) and per-channel inserts already exist; the master is a bare `EffectConfig[]` with no id/numbering. A song effect table needs a new schema field plus migration (>=27) mapping `masterEffects` and `insertEffects`/`sendBuses[].effects` into table entries.
- Two insert engines (Tone `ChannelEffectsManager` vs WASM routed via isolation slots, max 4 slots) means table slots on WASM-engine songs compete for slots; dub-send tap outputs [5..] are the free per-channel taps.
