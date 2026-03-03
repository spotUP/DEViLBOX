import * as Tone from 'tone';
import type { InstrumentConfig, EffectConfig, MAMEConfig } from '@typedefs/instrument';
import { DB303Synth, DB303Synth as JC303Synth } from '../db303';
import { MAMESynth } from '../MAMESynth';
import { MAMEBaseSynth } from '../mame/MAMEBaseSynth';
import { WAMSynth } from '../wam/WAMSynth';

/** Ramp time for smooth parameter transitions (seconds) */
export const EFFECT_RAMP_TIME = 0.02;

/** Shared context type that ToneEngine passes in */
export interface SynthUpdateContext {
  instruments: Map<number, Tone.ToneAudioNode | any>;
  instrumentIdFromKey: (key: number) => number;
  getInstrumentKey: (instrumentId: number, channel: number) => number;
  invalidateInstrument: (instrumentId: number) => void;
  getInstrument: (instrumentId: number, config: InstrumentConfig) => any;
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
  const synths: Array<{ uploadInstrumentData: (data: Uint8Array) => void }> = [];
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId && (instrument as unknown as { uploadInstrumentData?: unknown }).uploadInstrumentData) {
      synths.push(instrument as unknown as { uploadInstrumentData: (data: Uint8Array) => void });
    }
  });

  if (synths.length === 0) {
    // No instances yet - instrument will be created with correct config on next note
    ctx.invalidateInstrument(instrumentId);
    return;
  }

  // Dynamically import the encoder (code-split to reduce main bundle)
  import('@lib/export/FurnaceInstrumentEncoder').then(({ updateFurnaceInstrument }) => {
    const furnaceIndex = config.furnace!.furnaceIndex ?? 0;
    const binaryData = updateFurnaceInstrument(config.furnace!, config.name, furnaceIndex);
    
    // Update all synth instances
    synths.forEach((synth) => {
      synth.uploadInstrumentData(binaryData);
    });
    
  }).catch(err => {
    console.error('[ToneEngine] Failed to encode Furnace instrument:', err);
  });
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

/**
 * Update a text parameter on a MAME chip synth instrument (e.g. speech text).
 */
export function updateMAMEChipTextParam(ctx: SynthUpdateContext, instrumentId: number, key: string, value: string): void {
  const instrumentKey = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(instrumentKey);
  if (!instrument) return;
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
    try {
      const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
      const config = useInstrumentStore.getState().instruments.find(
        (i: InstrumentConfig) => i.id === instrumentId
      );
      if (config) {
        instrument = ctx.getInstrument(instrumentId, config) ?? undefined;
        // Wait for WASM synth to initialize (ensures worklet is ready before speakText)
        if (instrument && typeof (instrument as any).ensureInitialized === 'function') {
          await (instrument as any).ensureInitialized();
        }
        // Also wait for async effect chain to connect (buildInstrumentEffectChain is fire-and-forget in getInstrument)
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (_err) {
      console.warn('[ToneEngine] speakMAMEChipText: failed to lazy-create instrument:', _err);
    }
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
  const instrumentKey = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(instrumentKey);
  if (!instrument) return;

  const synth = instrument as unknown as { loadROM?: (bank: number, data: Uint8Array) => void; loadWaveROM?: (buffer: ArrayBuffer) => void; setRom?: (bank: number, data: Uint8Array) => void };

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

        // LFO 1 (indices 44-50: Mode, KeySync, EnvMode, Rate, Phase, Polarity, Amplify)
        if (config.lfo1) {
          v2.setParameter(47, config.lfo1.rate);
          v2.setParameter(50, config.lfo1.depth);
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
 * Update Dexed (DX7) parameters in real-time
 */
export function updateDexedParameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['dexed']>): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
        (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
      }
    }
  });
}

/**
 * Update OBXd (Oberheim) parameters in real-time
 */
export function updateOBXdParameters(ctx: SynthUpdateContext, instrumentId: number, config: NonNullable<InstrumentConfig['obxd']>): void {
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) === instrumentId) {
      if (instrument && typeof (instrument as unknown as { applyConfig?: unknown }).applyConfig === 'function') {
        (instrument as unknown as { applyConfig: (config: unknown) => void }).applyConfig(config);
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
 * Update standard Tone.js synth parameters in real-time (no instrument recreation)
 * Handles oscillator, envelope, filter, filterEnvelope changes with smooth ramping
 */
export function updateToneJsSynthInPlace(ctx: SynthUpdateContext, instrumentId: number, config: InstrumentConfig): void {
  const R = EFFECT_RAMP_TIME;
  ctx.instruments.forEach((instrument, key) => {
    if (ctx.instrumentIdFromKey(key) !== instrumentId) return;
    const inst = instrument as any;

    // Update oscillator type (discrete, no ramp needed)
    if (config.oscillator?.type && inst.oscillator) {
      try {
        const type = config.oscillator.type === 'noise' ? 'sawtooth' : config.oscillator.type;
        inst.oscillator.type = type;
      } catch { /* PolySynth wraps oscillator differently */ }
    }
    // PolySynth: update via .set()
    if (instrument instanceof Tone.PolySynth && config.oscillator?.type) {
      try {
        const type = config.oscillator.type === 'noise' ? 'sawtooth' : config.oscillator.type;
        instrument.set({ oscillator: { type: type as Tone.ToneOscillatorType } } as any);
      } catch { /* ignore */ }
    }

    // Update envelope (with ramp for smooth transitions)
    if (config.envelope) {
      const env = config.envelope;
      try {
        if (instrument instanceof Tone.PolySynth) {
          instrument.set({
            envelope: {
              attack: (env.attack ?? 10) / 1000,
              decay: (env.decay ?? 200) / 1000,
              sustain: (env.sustain ?? 50) / 100,
              release: (env.release ?? 1000) / 1000,
            }
          });
        } else if (inst.envelope) {
          inst.envelope.attack = (env.attack ?? 10) / 1000;
          inst.envelope.decay = (env.decay ?? 200) / 1000;
          inst.envelope.sustain = (env.sustain ?? 50) / 100;
          inst.envelope.release = (env.release ?? 1000) / 1000;
        }
      } catch { /* ignore */ }
    }

    // Update filter (with ramp)
    if (config.filter && inst.filter) {
      try {
        if (config.filter.frequency !== undefined) {
          inst.filter.frequency.rampTo(config.filter.frequency, R);
        }
        if (config.filter.Q !== undefined) {
          inst.filter.Q.rampTo(config.filter.Q, R);
        }
        if (config.filter.type) {
          inst.filter.type = config.filter.type;
        }
      } catch { /* ignore */ }
    }

    // Update volume (with ramp)
    if (config.volume !== undefined && inst.volume) {
      try {
        inst.volume.rampTo(config.volume, R);
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
 * Update ChipSynth arpeggio configuration in real-time
 * @param instrumentId - Instrument ID
 * @param arpeggioConfig - New arpeggio configuration
 */
export function updateChipSynthArpeggio(ctx: SynthUpdateContext, instrumentId: number, arpeggioConfig: NonNullable<InstrumentConfig['chipSynth']>['arpeggio']): void {
  if (!arpeggioConfig) return;

  // Find all channel instances of this instrument
  ctx.instruments.forEach((instrument, key) => {
    if ((key >> 16) === instrumentId && (instrument as any).updateArpeggio) {
      (instrument as any).updateArpeggio(arpeggioConfig);
    }
  });
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
