import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig, MAMEConfig } from '@typedefs/instrument';
import { DB303Synth, DB303Synth as JC303Synth } from '../db303';
import { MAMESynth } from '../MAMESynth';
import { MAMEBaseSynth } from '../mame/MAMEBaseSynth';
import { WAMSynth } from '../wam/WAMSynth';
import { applyToneVoiceOptions, staticFilterOptions, toneVoiceTypeOf } from './toneSynthKnobs';
import { voiceFilterOf, voiceSourceOf } from './toneVoiceProbe';
import { getNormalizedVolume } from '../factories/volumeNormalization';

/** Ramp time for smooth parameter transitions (seconds) */
export const EFFECT_RAMP_TIME = 0.02;

/** Shared context type that ToneEngine passes in */
export interface SynthUpdateContext {
  instruments: Map<number, Tone.ToneAudioNode | any>;
  instrumentIdFromKey: (key: number) => number;
  getInstrumentKey: (instrumentId: number, channel: number) => number;
  invalidateInstrument: (instrumentId: number) => void;
  getInstrument: (instrumentId: number, config: InstrumentConfig) => any;
  /** Resolves when the instrument's effect chain (kicked off by getInstrument) is connected. */
  awaitEffectChain?: (key: number) => Promise<unknown>;
  buildInstrumentEffectChain?: (key: number, effects: EffectConfig[], instrument: any) => Promise<void>;
}

export function updateWAMParameters(ctx: SynthUpdateContext, instrumentId: number, wamConfig: NonNullable<InstrumentConfig['wam']>): void {
  const synths: WAMSynth[] = [];
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && instrument instanceof WAMSynth) {
      synths.push(instrument);
    }
  });

  if (synths.length === 0) {
    ctx.invalidateInstrument(instrumentId);
    return;
  }

  synths.forEach((synth) => {
    // Handle individual parameter updates (from fallback UI)
    if (wamConfig.parameterValues) {
      Object.entries(wamConfig.parameterValues).forEach(([id, value]) => {
        synth.setParameter(id, value);
      });
    }
    // Handle full state replacement
    if (wamConfig.pluginState) {
      synth.setPluginState(wamConfig.pluginState);
    }
  });
}

/**
 * Update TB303 parameters in real-time without recreating the synth
 * Supports both JC303Synth (TB303) and BuzzmachineGenerator (Buzz3o3)
 */
export function updateTB303Parameters(ctx: SynthUpdateContext, instrumentId: number, tb303Config: NonNullable<InstrumentConfig['tb303']>): void {
  // Find all DB303Synth instances for this instrument
  const synths: DB303Synth[] = [];
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && instrument instanceof DB303Synth) {
      synths.push(instrument);
    }
  });

  if (synths.length === 0) {
    // No instances yet - instrument will be created with correct config on next note
    ctx.invalidateInstrument(instrumentId);
    return;
  }

  // Delegate directly to DB303Synth — it owns its own parameter mapping.
  // All config values are already 0-1 normalized from the UI knobs.
  synths.forEach((synth) => synth.applyConfig(tb303Config));
}

/**
 * Update Furnace instrument parameters in real-time
 * Re-encodes the instrument config to binary format and re-uploads to WASM
 */
export function updateFurnaceInstrument(ctx: SynthUpdateContext, instrumentId: number, config: InstrumentConfig): void {
  if (!config.furnace || !config.synthType?.startsWith('Furnace')) {
    console.warn('[ToneEngine] updateFurnaceInstrument called on non-Furnace instrument');
    return;
  }

  // Find all FurnaceDispatchSynth instances for this instrument
  const synths: Array<{ uploadInstrumentFromConfig: (config: Record<string, unknown>, name: string) => Promise<void> }> = [];
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && (instrument as unknown as { uploadInstrumentFromConfig?: unknown }).uploadInstrumentFromConfig) {
      synths.push(instrument as unknown as { uploadInstrumentFromConfig: (config: Record<string, unknown>, name: string) => Promise<void> });
    }
  });

  if (synths.length === 0) {
    // No instances yet - instrument will be created with correct config on next note
    ctx.invalidateInstrument(instrumentId);
    return;
  }

  // The synth's own upload: its slot, the chip's instrument shape, and the
  // channel re-select that makes the chip take the new patch. Encoding here
  // with the config's own index (0 for a user instrument) put the patch in
  // slot 0 - every other instrument's - in the shape of the wrong chip.
  const furnace = config.furnace as unknown as Record<string, unknown>;
  synths.forEach((synth) => {
    synth.uploadInstrumentFromConfig(furnace, config.name).catch((err) => {
      console.error('[ToneEngine] Failed to upload Furnace instrument:', err);
    });
  });
}

/**
 * Update UpRoughSoftsynth voice/params/seed in real-time (live instances keep their render cache keyed by params).
 */
export function updateUpRoughSoftsynthParameters(ctx: SynthUpdateContext, instrumentId: number, cfg: NonNullable<InstrumentConfig['upRoughSoftsynth']>): void {
  const synths: Array<{ applyConfig: (config: typeof cfg) => void }> = [];
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && (instrument as unknown as { applyConfig?: unknown }).applyConfig) {
      synths.push(instrument as unknown as { applyConfig: (config: typeof cfg) => void });
    }
  });
  if (synths.length === 0) {
    ctx.invalidateInstrument(instrumentId);
    return;
  }
  synths.forEach((synth) => synth.applyConfig(cfg));
}

/**
 * Update HarmonicSynth parameters in real-time without recreating the synth
 */
export function updateHarmonicSynthParameters(ctx: SynthUpdateContext, instrumentId: number, harmonicConfig: NonNullable<InstrumentConfig['harmonicSynth']>): void {
  const synths: Array<{ applyConfig: (config: typeof harmonicConfig) => void }> = [];
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && (instrument as unknown as { applyConfig?: unknown }).applyConfig) {
      synths.push(instrument as unknown as { applyConfig: (config: typeof harmonicConfig) => void });
    }
  });

  if (synths.length === 0) {
    // No instances yet - instrument will be created with correct config on next note
    ctx.invalidateInstrument(instrumentId);
    return;
  }

  // Apply config to all active instances
  synths.forEach((synth) => synth.applyConfig(harmonicConfig));
}

/**
 * Get the WASM handle for a MAME synth instance
 */
export function getMAMESynthHandle(ctx: SynthUpdateContext, instrumentId: number): number {
  const key = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(key);
  if (instrument instanceof MAMESynth) {
    return (instrument as unknown as { getHandle: () => number }).getHandle();
  }
  return 0;
}

/**
 * Get a MAME chip synth instance (extends MAMEBaseSynth)
 * Used for accessing oscilloscope data and macro controls
 */
export function getMAMEChipSynth(ctx: SynthUpdateContext, instrumentId: number): MAMEBaseSynth | null {
  const key = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(key);
  if (instrument instanceof MAMEBaseSynth) {
    return instrument;
  }
  // Also check channel-specific keys
  for (const [k, inst] of ctx.instruments) {
    if ((k >> 16) === instrumentId && inst instanceof MAMEBaseSynth) {
      return inst;
    }
  }
  return null;
}

/**
 * Update MAME parameters in real-time
 */
export function updateMAMEParameters(ctx: SynthUpdateContext, instrumentId: number, config: Partial<MAMEConfig>): void {
  const key = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(key);
  if (instrument instanceof MAMESynth) {
    // MAMESynth instances are typically updated via register writes
    // Apply global config changes like clock if provided
    void config; // Reserved for future per-register update support
  }
}

/**
 * Update a parameter on a MAME chip synth instrument in real-time.
 * @param instrumentId - The instrument ID
 * @param key - Parameter key (e.g. 'vibrato_speed', 'algorithm')
 * @param value - Parameter value
 */
export function updateMAMEChipParam(ctx: SynthUpdateContext, instrumentId: number, key: string, value: number): void {
  const instrumentKey = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(instrumentKey);
  if (!instrument) return;
  const inst = instrument as unknown as { setParam?: (key: string, value: number) => void };
  if (typeof inst.setParam === 'function') {
    inst.setParam(key, value);
  }
}

/**
 * Load a built-in WASM preset on a MAME chip synth instrument.
 * @param instrumentId - The instrument ID
 * @param program - Preset program number
 */
export function loadMAMEChipPreset(ctx: SynthUpdateContext, instrumentId: number, program: number): void {
  const instrumentKey = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(instrumentKey);
  if (!instrument) return;
  const inst = instrument as unknown as { loadPreset?: (program: number) => void };
  if (typeof inst.loadPreset === 'function') {
    inst.loadPreset(program);
  }
}

interface LazyInitializable {
  ensureInitialized?: () => Promise<void>;
}

/**
 * Create an instrument on demand from the instrument store and wait until it
 * can actually be heard: worklet initialized AND its effect chain connected.
 * The chain connect used to be papered over with a 50 ms sleep — the engine
 * tracks the chain promise (pendingEffectChains) precisely so callers can
 * await it, so wait on the real signal instead of a guess.
 */
async function lazyCreateInstrument(
  ctx: SynthUpdateContext,
  instrumentId: number,
  instrumentKey: number,
  caller: string,
): Promise<unknown> {
  try {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const config = useInstrumentStore.getState().instruments.find(
      (i: InstrumentConfig) => i.id === instrumentId
    );
    if (!config) return undefined;
    const instrument = ctx.getInstrument(instrumentId, config) ?? undefined;
    const init = (instrument as LazyInitializable | undefined)?.ensureInitialized;
    if (instrument && typeof init === 'function') {
      await init.call(instrument);
    }
    await ctx.awaitEffectChain?.(instrumentKey);
    return instrument;
  } catch (err) {
    console.warn(`[ToneEngine] ${caller}: failed to lazy-create instrument:`, err);
    return undefined;
  }
}

/**
 * Update a text parameter on a MAME chip synth instrument (e.g. speech text).
 * Lazily creates the instrument if it hasn't been preloaded into the engine yet.
 */
export async function updateMAMEChipTextParam(ctx: SynthUpdateContext, instrumentId: number, key: string, value: string): Promise<void> {
  const instrumentKey = ctx.getInstrumentKey(instrumentId, -1);
  let instrument = ctx.instruments.get(instrumentKey);

  if (!instrument) {
    instrument = await lazyCreateInstrument(ctx, instrumentId, instrumentKey, 'updateMAMEChipTextParam');
  }

  if (!instrument) {
    console.warn(`[ToneEngine] updateMAMEChipTextParam: no instrument config found for id=${instrumentId}`);
    return;
  }

  const inst = instrument as unknown as { setTextParam?: (key: string, value: string) => void; applyConfig?: (config: Record<string, string>) => void };
  if (typeof inst.setTextParam === 'function') {
    inst.setTextParam(key, value);
  } else if (typeof inst.applyConfig === 'function') {
    inst.applyConfig({ [key]: value });
  }
}

/**
 * Trigger text-to-speech on a MAME speech chip synth.
 * Lazily creates the instrument if it hasn't been preloaded into the engine yet.
 */
export async function speakMAMEChipText(ctx: SynthUpdateContext, instrumentId: number, text: string): Promise<void> {
  const instrumentKey = ctx.getInstrumentKey(instrumentId, -1);
  let instrument = ctx.instruments.get(instrumentKey);

  // If instrument not in engine map, create it on-demand from the instrument store
  if (!instrument) {
    instrument = await lazyCreateInstrument(ctx, instrumentId, instrumentKey, 'speakMAMEChipText');
  }

  if (!instrument) {
    console.warn(`[ToneEngine] speakMAMEChipText: no instrument config found for id=${instrumentId}`);
    return;
  }

  const synth = instrument as unknown as { speakText?: (text: string) => void; _isReady?: boolean; workletNode?: unknown };
  if (typeof synth.speakText === 'function') {
    synth.speakText(text);
  } else {
    console.warn(`[ToneEngine] speakMAMEChipText: instrument key="${instrumentKey}" has no speakText method`);
  }
}

/**
 * Load ROM data into a synth that requires external ROM files.
 * Dispatches to the appropriate ROM loading method based on synthType.
 */
export function loadSynthROM(ctx: SynthUpdateContext, instrumentId: number, synthType: string, bank: number, data: Uint8Array): void {
  // Every instance of the instrument (shared plus one per tracker channel) needs the ROM.
  for (const [key, instrument] of ctx.instruments) {
    if (ctx.instrumentIdFromKey(key) !== instrumentId) continue;
    loadSynthROMInto(instrument, synthType, bank, data);
  }
}

function loadSynthROMInto(instrument: unknown, synthType: string, bank: number, data: Uint8Array): void {
  const synth = instrument as {
    loadROM?: (bank: number, data: Uint8Array) => void;
    loadRom?: (data: Uint8Array) => void;
    loadWaveROM?: (buffer: ArrayBuffer) => void;
    setRom?: (bank: number, data: Uint8Array) => void;
    romLoaded?: boolean;
  };

  const SINGLE_ROM_CHIPS = new Set([
    'MAMEMultiPCM', 'MAMEZSG2', 'MAMEKS0164',
    'MAMESWP00', 'MAMESWP20', 'MAMERolandGP',
  ]);

  if (synthType === 'MAMERSA') {
    // RdPianoSynth / D50Synth: loadROM(romId, data)
    if (typeof synth.loadROM === 'function') {
      synth.loadROM(bank, data);
    }
  } else if (synthType === 'MAMESWP30') {
    // MU2000Synth: loadWaveROM(data) - single ROM bank
    if (typeof synth.loadWaveROM === 'function') {
      synth.loadWaveROM(data.buffer as ArrayBuffer);
    }
  } else if (SINGLE_ROM_CHIPS.has(synthType)) {
    // MultiPCM, ZSG2, KS0164, SWP00, SWP20, RolandGP: loadRom(data) single buffer
    if (typeof synth.loadRom === 'function') {
      synth.loadRom(data);
      synth.romLoaded = true;
    }
  } else {
    // Generic fallback: try loadROM, then setRom
    if (typeof synth.loadROM === 'function') {
      synth.loadROM(bank, data);
    } else if (typeof synth.setRom === 'function') {
      synth.setRom(bank, data);
    }
  }
}

/**
 * Update Dub Siren parameters in real-time
 */
export function updateDubSirenParameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['dubSiren']>): void {
  let found = false;
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      // Use feature detection for more reliable check across HMR/bundling
      if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
        (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
        found = true;
      }
    }
  });
  if (!found) {
    console.warn(`[ToneEngine] No DubSiren synth found to update for instrument ${instrumentId}`);
  }
}

/**
 * Update Space Laser parameters in real-time
 */
export function updateSpaceLaserParameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['spaceLaser']>): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
        (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
      }
    }
  });
}

/**
 * Update V2 parameters in real-time
 */
export function updateV2Parameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['v2']>): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && (instrument as unknown as { name?: string }).name === 'V2Synth') {
        const v2 = instrument as unknown as { setParameter: (index: number, value: number) => void };
        
        // Ground Truth Mapping from V2 v2defs.cpp / Params[]
        
        // Osc 1 (indices 2-7)
        if (config.osc1) {
          v2.setParameter(2, config.osc1.mode);
          v2.setParameter(4, config.osc1.transpose + 64);
          v2.setParameter(5, config.osc1.detune + 64);
          v2.setParameter(6, config.osc1.color);
          v2.setParameter(7, config.osc1.level);
        }
        
        // Osc 2 (indices 8-13)
        if (config.osc2) {
          v2.setParameter(8, config.osc2.mode);
          v2.setParameter(9, config.osc2.ringMod ? 1 : 0);
          v2.setParameter(10, config.osc2.transpose + 64);
          v2.setParameter(11, config.osc2.detune + 64);
          v2.setParameter(12, config.osc2.color);
          v2.setParameter(13, config.osc2.level);
        }

        // Osc 3 (indices 14-19)
        if (config.osc3) {
          v2.setParameter(14, config.osc3.mode);
          v2.setParameter(15, config.osc3.ringMod ? 1 : 0);
          v2.setParameter(16, config.osc3.transpose + 64);
          v2.setParameter(17, config.osc3.detune + 64);
          v2.setParameter(18, config.osc3.color);
          v2.setParameter(19, config.osc3.level);
        }

        // Filter 1 (indices 20-22)
        if (config.filter1) {
          v2.setParameter(20, config.filter1.mode);
          v2.setParameter(21, config.filter1.cutoff);
          v2.setParameter(22, config.filter1.resonance);
        }

        // Filter 2 (indices 23-25)
        if (config.filter2) {
          v2.setParameter(23, config.filter2.mode);
          v2.setParameter(24, config.filter2.cutoff);
          v2.setParameter(25, config.filter2.resonance);
        }

        // Routing (indices 26-27)
        if (config.routing) {
          v2.setParameter(26, config.routing.mode);
          v2.setParameter(27, config.routing.balance);
        }

        // Amp Envelope (indices 32-37: Attack, Decay, Sustain, SusTime, Release, Amplify)
        if (config.envelope) {
          v2.setParameter(32, config.envelope.attack);
          v2.setParameter(33, config.envelope.decay);
          v2.setParameter(34, config.envelope.sustain);
          v2.setParameter(36, config.envelope.release);
        }

        // Envelope 2 (indices 38-43: Attack, Decay, Sustain, SusTime, Release, Amplify)
        if (config.envelope2) {
          v2.setParameter(38, config.envelope2.attack);
          v2.setParameter(39, config.envelope2.decay);
          v2.setParameter(40, config.envelope2.sustain);
          v2.setParameter(42, config.envelope2.release);
        }

        // Voice distortion (indices 28-31: Mode, InGain, Param1, Param2)
        if (config.voiceDistortion) {
          v2.setParameter(28, config.voiceDistortion.mode);
          v2.setParameter(29, config.voiceDistortion.inGain);
          v2.setParameter(30, config.voiceDistortion.param1);
          v2.setParameter(31, config.voiceDistortion.param2);
        }

        // LFO 1 (indices 44-50: Mode, KeySync, EnvMode, Rate, Phase, Polarity, Amplify)
        if (config.lfo1) {
          v2.setParameter(47, config.lfo1.rate);
          v2.setParameter(50, config.lfo1.depth);
        }

        // LFO 2 (indices 51-57: Mode, KeySync, EnvMode, Rate, Phase, Polarity, Amplify)
        if (config.lfo2) {
          v2.setParameter(51, config.lfo2.mode);
          v2.setParameter(52, config.lfo2.keySync ? 1 : 0);
          v2.setParameter(53, config.lfo2.envMode ? 1 : 0);
          v2.setParameter(54, config.lfo2.rate);
          v2.setParameter(55, config.lfo2.phase);
          v2.setParameter(56, config.lfo2.polarity);
          v2.setParameter(57, config.lfo2.amplify);
        }

        // Channel distortion (indices 68-71: Mode, InGain, Param1, Param2)
        if (config.channelDistortion) {
          v2.setParameter(68, config.channelDistortion.mode);
          v2.setParameter(69, config.channelDistortion.inGain);
          v2.setParameter(70, config.channelDistortion.param1);
          v2.setParameter(71, config.channelDistortion.param2);
        }

        // Chorus/Flanger (indices 72-78: Amount, Feedback, DelayL, DelayR, ModRate, ModDepth, ModPhase)
        if (config.chorusFlanger) {
          v2.setParameter(72, config.chorusFlanger.amount);
          v2.setParameter(73, config.chorusFlanger.feedback);
          v2.setParameter(74, config.chorusFlanger.delayL);
          v2.setParameter(75, config.chorusFlanger.delayR);
          v2.setParameter(76, config.chorusFlanger.modRate);
          v2.setParameter(77, config.chorusFlanger.modDepth);
          v2.setParameter(78, config.chorusFlanger.modPhase);
        }

        // Compressor (indices 79-87: Mode, StereoLink, AutoGain, Lookahead, Threshold, Ratio, Attack, Release, OutGain)
        if (config.compressor) {
          v2.setParameter(79, config.compressor.mode);
          v2.setParameter(80, config.compressor.stereoLink ? 1 : 0);
          v2.setParameter(81, config.compressor.autoGain ? 1 : 0);
          v2.setParameter(82, config.compressor.lookahead);
          v2.setParameter(83, config.compressor.threshold);
          v2.setParameter(84, config.compressor.ratio);
          v2.setParameter(85, config.compressor.attack);
          v2.setParameter(86, config.compressor.release);
          v2.setParameter(87, config.compressor.outGain);
        }
      }
    }
  });
}

/**
 * Update Synare parameters in real-time
 */
export function updateSynareParameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['synare']>): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
        (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
      }
    }
  });
}

/**
 * Update Furnace parameters in real-time
 */
export function updateFurnaceParameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['furnace']>): void {
  void config; // Reserved for future direct parameter update support
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && typeof (instrument as unknown as { updateParameters?: unknown }).updateParameters === 'function') {
        (instrument as unknown as { updateParameters: () => void }).updateParameters();
      }
    }
  });
}

/**
 * Generic method to update complex synths that use the applyConfig pattern
 */
export function updateComplexSynthParameters(ctx: SynthUpdateContext, instrumentId: number, config: unknown): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
        (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
      }
    }
  });
}

/**
 * Update standard Tone.js synth parameters in real-time (no instrument recreation).
 * Every knob of the nine core synths goes through toneSynthKnobs.applyToneVoiceOptions - the same options the creation
 * paths build - so a knob cannot reach creation and miss this path.
 */
export function updateToneJsSynthInPlace(ctx: SynthUpdateContext, instrumentId: number, config: InstrumentConfig): void {
  const R = EFFECT_RAMP_TIME;
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) !== instrumentId) return;

    // Factories wrap some Tone nodes in plain objects; the probe registry knows the node behind the wrapper.
    const voiceType = toneVoiceTypeOf(config);
    try { applyToneVoiceOptions(voiceSourceOf(instrument), voiceType, config); } catch { /* a voice that rejects an option keeps the rest */ }
    // The static filter of the Synth family (poly / FM / AM voices): type, cutoff and Q follow the editor.
    const staticFilter = voiceFilterOf(instrument);
    if (staticFilter?.set && config.filter) {
      try { staticFilter.set(staticFilterOptions(config)); } catch { /* keep the rest */ }
    }

    // Update volume (with ramp)
    const volume = (instrument as { volume?: Tone.Param<'decibels'> }).volume;
    if (config.volume !== undefined && volume) {
      try {
        // the level the creation paths gave it: volume plus the synth's normalization offset (one table)
        volume.rampTo(getNormalizedVolume(config.synthType, config.volume), R);
      } catch { /* ignore */ }
    }
  });
}

/**
 * Update Buzzmachine parameters in real-time
 */
export function updateBuzzmachineParameters(ctx: SynthUpdateContext, instrumentId: number, buzzmachine: NonNullable<InstrumentConfig['buzzmachine']>): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      const inst = instrument as unknown as { setParameter?: (index: number, value: number) => void };
      if (instrument && typeof inst.setParameter === 'function') {
        Object.entries(buzzmachine.parameters).forEach(([index, value]) => {
          inst.setParameter!(Number(index), value);
        });
      }
    }
  });
}

/**
 * Update TB303 pedalboard/GuitarML configuration
 * Only call this when pedalboard config changes to avoid audio interruptions
 */
export async function updateTB303Pedalboard(ctx: SynthUpdateContext, instrumentId: number, pedalboard: NonNullable<InstrumentConfig['tb303']>['pedalboard']): Promise<void> {
  if (!pedalboard) return;

  // Find all channel instances of this instrument
  const synths: JC303Synth[] = [];
  ctx.instruments.forEach((instrument, key) => {
    if ((key >> 16) === instrumentId && (instrument instanceof JC303Synth)) {
      synths.push(instrument);
    }
  });

  if (synths.length === 0) {
    console.warn('[ToneEngine] Cannot update TB303 pedalboard - no TB303 instances found for instrument', instrumentId);
    return;
  }

  const hasNeuralEffect = pedalboard.enabled && pedalboard.chain.some((fx: { enabled: boolean; type: string }) => fx.enabled && fx.type === 'neural');

  // Update all instances
  for (const synth of synths) {
    if (hasNeuralEffect) {
      // Find first enabled neural effect
      const neuralEffect = pedalboard.chain.find((fx: { enabled: boolean; type: string }) => fx.enabled && fx.type === 'neural');
      const fx = neuralEffect as EffectConfig | undefined;
      if (fx && fx.neuralModelIndex !== undefined) {
        try {
          // Load GuitarML model and enable
          await synth.loadGuitarMLModel(fx.neuralModelIndex);
          await synth.setGuitarMLEnabled(true);

          // Set dry/wet mix if specified
          if (fx.parameters?.dryWet !== undefined) {
            synth.setGuitarMLMix(fx.parameters.dryWet as number);
          }
        } catch (err) {
          console.error('[ToneEngine] Failed to update GuitarML:', err);
        }
      }
    } else {
      // Disable GuitarML if no neural effects
      try {
        await synth.setGuitarMLEnabled(false);
      } catch (err) {
        console.error('[ToneEngine] Failed to disable GuitarML:', err);
      }
    }
  }
}

/**
 * Get current arpeggio step for a ChipSynth instrument (for UI visualization)
 * @param instrumentId - Instrument ID
 * @returns Current step index or 0 if not found/playing
 */
export function getChipSynthArpeggioStep(ctx: SynthUpdateContext, instrumentId: number): number {
  // Find first channel instance with arpeggio engine
  for (const [key, instrument] of ctx.instruments.entries()) {
    if ((key >> 16) === instrumentId && (instrument as any).getCurrentArpeggioStep) {
      return (instrument as any).getCurrentArpeggioStep();
    }
  }
  return 0;
}

/**
 * Check if ChipSynth arpeggio is currently playing
 * @param instrumentId - Instrument ID
 * @returns True if arpeggio is actively playing
 */
export function isChipSynthArpeggioPlaying(ctx: SynthUpdateContext, instrumentId: number): boolean {
  // Find first channel instance with arpeggio engine
  for (const [key, instrument] of ctx.instruments.entries()) {
    if ((key >> 16) === instrumentId && (instrument as any).isArpeggioPlaying) {
      return (instrument as any).isArpeggioPlaying();
    }
  }
  return false;
}

/**
 * Re-upload Sonic Arranger instrument config to running WASM synth.
 * Called when the user edits SA instrument parameters in the instrument editor.
 */
export function updateSonicArrangerParameters(
  ctx: SynthUpdateContext,
  instrumentId: number,
  config: import('@typedefs/instrument').SonicArrangerConfig,
): void {
  updateNativeSynthConfig(ctx, instrumentId, config);
}

/**
 * Generic live parameter update for any native WASM synth with updateConfig().
 * Works for all Amiga synth engines (FC, SoundMon, SidMon, DigMug, Fred, TFMX,
 * HippelCoSo, RobHubbard, OctaMED, DavidWhittaker, DeltaMusic1/2, SonicArranger, InStereo).
 */
export function updateNativeSynthConfig(
  ctx: SynthUpdateContext,
  instrumentId: number,
  config: unknown,
): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && typeof (instrument as any).updateConfig === 'function') {
      (instrument as any).updateConfig(config);
    }
  });
}
