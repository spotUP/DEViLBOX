/**
 * V2M File Parser
 * 
 * Parses Farbrausch V2M music files and extracts:
 * - Note events
 * - Program changes
 * - Pitch bends
 * - Control changes
 * - Patch/instrument data
 * - Global effects
 * 
 * Based on v2mconv.cpp format documentation.
 */

import type { V2InstrumentConfig, V2GlobalEffects } from '../../types/v2Instrument';
import { DEFAULT_V2_INSTRUMENT, DEFAULT_V2_GLOBALS } from '../../types/v2Instrument';

/**
 * V2M note event
 */
export interface V2MNoteEvent {
  time: number;      // Absolute time in ticks
  note: number;      // MIDI note number
  velocity: number;  // 0-127
  duration: number;  // Duration in ticks
}

/**
 * V2M program change
 */
export interface V2MProgramChange {
  time: number;
  program: number;
}

/**
 * V2M pitch bend
 */
export interface V2MPitchBend {
  time: number;
  value: number;     // 0-16383
}

/**
 * V2M control change
 */
export interface V2MControlChange {
  time: number;
  controller: number; // CC number (1-7 mapped to specific controls)
  value: number;
}

/**
 * V2M channel data
 */
export interface V2MChannel {
  notes: V2MNoteEvent[];
  programChanges: V2MProgramChange[];
  pitchBends: V2MPitchBend[];
  controlChanges: V2MControlChange[][];  // 7 CC types per channel
}

/**
 * Parsed V2M file
 */
export interface V2MFile {
  timediv: number;           // Ticks per beat
  maxTime: number;           // Song length in ticks
  channels: V2MChannel[];    // 16 MIDI channels
  patches: Uint8Array[];     // Raw patch data
  globals: Uint8Array;       // Global effects data
  speechData?: Uint8Array;   // Optional speech synth data
}

/**
 * Parse a V2M file buffer
 */
export function parseV2M(data: ArrayBuffer): V2MFile {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  let offset = 0;

  // Header
  const timediv = view.getUint32(offset, true);
  offset += 4;
  const maxTime = view.getUint32(offset, true);
  offset += 4;
  const gdnum = view.getUint32(offset, true);
  offset += 4;

  // Skip global timing data
  offset += gdnum * 10;

  // Parse 16 channels
  const channels: V2MChannel[] = [];
  
  for (let ch = 0; ch < 16; ch++) {
    const notenum = view.getUint32(offset, true);
    offset += 4;

    const channel: V2MChannel = {
      notes: [],
      programChanges: [],
      pitchBends: [],
      controlChanges: [[], [], [], [], [], [], []],
    };

    if (notenum > 0) {
      // Note events - 5 bytes each (3 for delta time, 1 for note, 1 for velocity)
      const notePtr = offset;
      offset += 5 * notenum;

      // Parse notes
      let time = 0;
      for (let i = 0; i < notenum; i++) {
        const dt = bytes[notePtr + i] + 
                   bytes[notePtr + notenum + i] * 0x100 + 
                   bytes[notePtr + 2 * notenum + i] * 0x10000;
        const note = bytes[notePtr + 3 * notenum + i];
        const velocity = bytes[notePtr + 4 * notenum + i];
        
        time += dt;
        
        // Velocity 0 is note-off, skip
        if (velocity > 0) {
          channel.notes.push({
            time,
            note,
            velocity,
            duration: 0, // Will be computed later
          });
        }
      }

      // Program changes - 4 bytes each
      const pcnum = view.getUint32(offset, true);
      offset += 4;
      const pcPtr = offset;
      offset += 4 * pcnum;

      time = 0;
      let program = 0;
      for (let i = 0; i < pcnum; i++) {
        const dt = bytes[pcPtr + i] + 
                   bytes[pcPtr + pcnum + i] * 0x100 + 
                   bytes[pcPtr + 2 * pcnum + i] * 0x10000;
        const pgmDelta = bytes[pcPtr + 3 * pcnum + i];
        
        time += dt;
        program += pgmDelta;
        
        channel.programChanges.push({ time, program });
      }

      // Pitch bends - 5 bytes each
      const pbnum = view.getUint32(offset, true);
      offset += 4;
      const pbPtr = offset;
      offset += 5 * pbnum;

      time = 0;
      for (let i = 0; i < pbnum; i++) {
        const dt = bytes[pbPtr + i] + 
                   bytes[pbPtr + pbnum + i] * 0x100 + 
                   bytes[pbPtr + 2 * pbnum + i] * 0x10000;
        const pbValue = bytes[pbPtr + 3 * pbnum + i] + 
                        bytes[pbPtr + 4 * pbnum + i] * 0x100;
        
        time += dt;
        channel.pitchBends.push({ time, value: pbValue });
      }

      // 7 control change types
      for (let cc = 0; cc < 7; cc++) {
        const ccnum = view.getUint32(offset, true);
        offset += 4;
        const ccPtr = offset;
        offset += 4 * ccnum;

        time = 0;
        for (let i = 0; i < ccnum; i++) {
          const dt = bytes[ccPtr + i] + 
                     bytes[ccPtr + ccnum + i] * 0x100 + 
                     bytes[ccPtr + 2 * ccnum + i] * 0x10000;
          const value = bytes[ccPtr + 3 * ccnum + i];
          
          time += dt;
          channel.controlChanges[cc].push({ time, controller: cc, value });
        }
      }
    }

    channels.push(channel);
  }

  // Globals
  const globSize = view.getUint32(offset, true);
  offset += 4;
  const globals = bytes.slice(offset, offset + globSize);
  offset += globSize;

  // Patches
  const patchSize = view.getUint32(offset, true);
  offset += 4;
  
  const patches: Uint8Array[] = [];
  
  if (patchSize > 0) {
    // Patch offset table first
    const patchData = bytes.slice(offset, offset + patchSize);
    const patchView = new DataView(patchData.buffer, patchData.byteOffset);
    
    // Determine number of patches from first offset
    const firstOffset = patchView.getUint32(0, true);
    const numPatches = firstOffset / 4;
    
    // Read patch offsets
    const offsets: number[] = [];
    for (let i = 0; i < numPatches; i++) {
      offsets.push(patchView.getUint32(i * 4, true));
    }
    
    // Extract each patch
    for (let i = 0; i < numPatches; i++) {
      const start = offsets[i];
      const end = i < numPatches - 1 ? offsets[i + 1] : patchSize;
      patches.push(patchData.slice(start, end));
    }
    
    offset += patchSize;
  }

  // Optional speech data
  let speechData: Uint8Array | undefined;
  if (offset + 4 <= data.byteLength) {
    const spSize = view.getUint32(offset, true);
    offset += 4;
    if (spSize > 0 && spSize <= 8192 && offset + spSize <= data.byteLength) {
      speechData = bytes.slice(offset, offset + spSize);
    }
  }

  return {
    timediv,
    maxTime,
    channels,
    patches,
    globals,
    speechData,
  };
}

/**
 * Parse raw patch bytes to V2InstrumentConfig
 */
export function patchBytesToConfig(patchData: Uint8Array): V2InstrumentConfig {
  // Start with defaults
  const config: V2InstrumentConfig = JSON.parse(JSON.stringify(DEFAULT_V2_INSTRUMENT));
  
  if (patchData.length < 89) {
    console.warn('[V2M] Patch data too short:', patchData.length);
    return config;
  }

  let i = 0;

  // Voice
  config.voice.panning = patchData[i++];
  config.voice.transpose = patchData[i++];

  // Osc 1
  config.osc1.mode = numberToOscMode(patchData[i++]);
  config.osc1.ringmod = patchData[i++] !== 0;
  config.osc1.transpose = patchData[i++];
  config.osc1.detune = patchData[i++];
  config.osc1.color = patchData[i++];
  config.osc1.volume = patchData[i++];

  // Osc 2
  config.osc2.mode = numberToOscMode(patchData[i++]);
  config.osc2.ringmod = patchData[i++] !== 0;
  config.osc2.transpose = patchData[i++];
  config.osc2.detune = patchData[i++];
  config.osc2.color = patchData[i++];
  config.osc2.volume = patchData[i++];

  // Osc 3
  config.osc3.mode = numberToOscMode(patchData[i++]);
  config.osc3.ringmod = patchData[i++] !== 0;
  config.osc3.transpose = patchData[i++];
  config.osc3.detune = patchData[i++];
  config.osc3.color = patchData[i++];
  config.osc3.volume = patchData[i++];

  // Filter 1
  config.filter1.mode = numberToFilterMode(patchData[i++]);
  config.filter1.cutoff = patchData[i++];
  config.filter1.resonance = patchData[i++];

  // Filter 2
  config.filter2.mode = numberToFilterMode(patchData[i++]);
  config.filter2.cutoff = patchData[i++];
  config.filter2.resonance = patchData[i++];

  // Routing
  config.filterRouting = numberToFilterRouting(patchData[i++]);
  config.filterBalance = patchData[i++];

  // Voice distortion
  config.voiceDistortion.mode = numberToDistMode(patchData[i++]);
  config.voiceDistortion.inGain = patchData[i++];
  config.voiceDistortion.param1 = patchData[i++];
  config.voiceDistortion.param2 = patchData[i++];

  // Amp envelope
  config.ampEnvelope.attack = patchData[i++];
  config.ampEnvelope.decay = patchData[i++];
  config.ampEnvelope.sustain = patchData[i++];
  config.ampEnvelope.sustainTime = patchData[i++];
  config.ampEnvelope.release = patchData[i++];
  config.ampEnvelope.amplify = patchData[i++];

  // Mod envelope
  config.modEnvelope.attack = patchData[i++];
  config.modEnvelope.decay = patchData[i++];
  config.modEnvelope.sustain = patchData[i++];
  config.modEnvelope.sustainTime = patchData[i++];
  config.modEnvelope.release = patchData[i++];
  config.modEnvelope.amplify = patchData[i++];

  // LFO 1
  config.lfo1.mode = numberToLFOMode(patchData[i++]);
  config.lfo1.keySync = patchData[i++] !== 0;
  config.lfo1.envMode = patchData[i++] !== 0;
  config.lfo1.rate = patchData[i++];
  config.lfo1.phase = patchData[i++];
  config.lfo1.polarity = numberToLFOPolarity(patchData[i++]);
  config.lfo1.amplify = patchData[i++];

  // LFO 2
  config.lfo2.mode = numberToLFOMode(patchData[i++]);
  config.lfo2.keySync = patchData[i++] !== 0;
  config.lfo2.envMode = patchData[i++] !== 0;
  config.lfo2.rate = patchData[i++];
  config.lfo2.phase = patchData[i++];
  config.lfo2.polarity = numberToLFOPolarity(patchData[i++]);
  config.lfo2.amplify = patchData[i++];

  // Globals
  config.voice.keySync = numberToKeySync(patchData[i++]);
  config.voice.channelVolume = patchData[i++];
  config.voice.auxARecv = patchData[i++];
  config.voice.auxBRecv = patchData[i++];
  config.voice.auxASend = patchData[i++];
  config.voice.auxBSend = patchData[i++];
  config.voice.reverb = patchData[i++];
  config.voice.delay = patchData[i++];
  config.voice.fxRoute = patchData[i++] !== 0 ? 'chorusThenDist' : 'distThenChorus';
  config.voice.boost = patchData[i++];

  // Channel distortion
  config.channelDistortion.mode = numberToDistMode(patchData[i++]);
  config.channelDistortion.inGain = patchData[i++];
  config.channelDistortion.param1 = patchData[i++];
  config.channelDistortion.param2 = patchData[i++];

  // Chorus/Flanger
  config.chorusFlanger.amount = patchData[i++];
  config.chorusFlanger.feedback = patchData[i++];
  config.chorusFlanger.delayL = patchData[i++];
  config.chorusFlanger.delayR = patchData[i++];
  config.chorusFlanger.modRate = patchData[i++];
  config.chorusFlanger.modDepth = patchData[i++];
  config.chorusFlanger.modPhase = patchData[i++];

  // Compressor
  config.compressor.mode = numberToCompMode(patchData[i++]);
  config.compressor.stereoLink = patchData[i++] !== 0;
  config.compressor.autoGain = patchData[i++] !== 0;
  config.compressor.lookahead = patchData[i++];
  config.compressor.threshold = patchData[i++];
  config.compressor.ratio = patchData[i++];
  config.compressor.attack = patchData[i++];
  config.compressor.release = patchData[i++];
  config.compressor.outGain = patchData[i++];

  // Max poly
  config.voice.maxPoly = patchData[i++];

  // Modulation matrix
  if (i < patchData.length) {
    const modCount = patchData[i++];
    config.modMatrix = [];
    for (let m = 0; m < modCount && i + 2 < patchData.length; m++) {
      config.modMatrix.push({
        source: numberToModSource(patchData[i++]),
        amount: patchData[i++],
        dest: patchData[i++],
      });
    }
  }

  return config;
}

/**
 * Parse global effects bytes to V2GlobalEffects
 */
export function globalBytesToEffects(globData: Uint8Array): V2GlobalEffects {
  const effects: V2GlobalEffects = JSON.parse(JSON.stringify(DEFAULT_V2_GLOBALS));
  
  if (globData.length < 22) {
    console.warn('[V2M] Global data too short:', globData.length);
    return effects;
  }

  let i = 0;

  effects.reverbTime = globData[i++];
  effects.reverbHighCut = globData[i++];
  effects.reverbLowCut = globData[i++];
  effects.reverbVolume = globData[i++];

  effects.delayVolume = globData[i++];
  effects.delayFeedback = globData[i++];
  effects.delayL = globData[i++];
  effects.delayR = globData[i++];
  effects.delayModRate = globData[i++];
  effects.delayModDepth = globData[i++];
  effects.delayModPhase = globData[i++];

  effects.lowCut = globData[i++];
  effects.highCut = globData[i++];

  effects.sumCompressor.mode = numberToCompMode(globData[i++]);
  effects.sumCompressor.stereoLink = globData[i++] !== 0;
  effects.sumCompressor.autoGain = globData[i++] !== 0;
  effects.sumCompressor.lookahead = globData[i++];
  effects.sumCompressor.threshold = globData[i++];
  effects.sumCompressor.ratio = globData[i++];
  effects.sumCompressor.attack = globData[i++];
  effects.sumCompressor.release = globData[i++];
  effects.sumCompressor.outGain = globData[i++];

  return effects;
}

// Helper conversion functions
import type { V2OscMode, V2FilterMode, V2FilterRouting, V2DistMode, V2LFOMode, V2LFOPolarity, V2KeySync, V2ModSource } from '../../types/v2Instrument';

function numberToOscMode(n: number): V2OscMode {
  const modes: V2OscMode[] = ['off', 'saw', 'pulse', 'sin', 'noise', 'fm', 'auxA', 'auxB'];
  return modes[n] ?? 'off';
}

function numberToFilterMode(n: number): V2FilterMode {
  const modes: V2FilterMode[] = ['off', 'low', 'band', 'high', 'notch', 'all', 'moogL', 'moogH'];
  return modes[n] ?? 'off';
}

function numberToFilterRouting(n: number): V2FilterRouting {
  const modes: V2FilterRouting[] = ['single', 'serial', 'parallel'];
  return modes[n] ?? 'single';
}

function numberToDistMode(n: number): V2DistMode {
  const modes: V2DistMode[] = ['off', 'overdrive', 'clip', 'bitcrush', 'decimate', 'lpf', 'bpf', 'hpf', 'notch', 'allpass', 'moogL'];
  return modes[n] ?? 'off';
}

function numberToLFOMode(n: number): V2LFOMode {
  const modes: V2LFOMode[] = ['saw', 'tri', 'pulse', 'sin', 'sampleHold'];
  return modes[n] ?? 'tri';
}

function numberToLFOPolarity(n: number): V2LFOPolarity {
  const modes: V2LFOPolarity[] = ['positive', 'negative', 'bipolar'];
  return modes[n] ?? 'positive';
}

function numberToKeySync(n: number): V2KeySync {
  const modes: V2KeySync[] = ['none', 'osc', 'full'];
  return modes[n] ?? 'none';
}

function numberToCompMode(n: number): 'off' | 'peak' | 'rms' {
  const modes: ('off' | 'peak' | 'rms')[] = ['off', 'peak', 'rms'];
  return modes[n] ?? 'off';
}

function numberToModSource(n: number): V2ModSource {
  const sources: V2ModSource[] = [
    'velocity', 'modulation', 'breath',
    'ctl3', 'ctl4', 'ctl5', 'ctl6', 'volume',
    'ampEG', 'eg2', 'lfo1', 'lfo2', 'note'
  ];
  return sources[n] ?? 'velocity';
}

/**
 * Get song duration in seconds
 */
export function getV2MDuration(v2m: V2MFile): number {
  // timediv is ticks per beat, assuming 120 BPM default
  const ticksPerSecond = (v2m.timediv * 120) / 60;
  return v2m.maxTime / ticksPerSecond;
}

/**
 * Get number of active channels (channels with note data)
 */
export function getV2MActiveChannels(v2m: V2MFile): number[] {
  return v2m.channels
    .map((ch, i) => ({ ch, i }))
    .filter(({ ch }) => ch.notes.length > 0)
    .map(({ i }) => i);
}
