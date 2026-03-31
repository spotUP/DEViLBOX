/**
 * NKS Parameter Maps for UADE / Exotic Amiga Synth Types
 *
 * Enables MIDI CC control and automation lanes for live DJ performances
 * with Amiga music formats. Each synth's config fields are mapped to
 * NKS pages (max 8 params per page) for hardware controller integration
 * (Komplete Kontrol, Maschine, etc.).
 *
 * All continuous parameters are normalized to 0-1 range — the synth
 * engine converts to native ranges internally.
 */

import type { NKSParameter } from './types';
import { NKSParameterType, NKSSection } from './types';

// ============================================================================
// Shared: UADE Playback-Only (catch-all for minimal/playback-only synths)
// Used by: UADESynth, Sc68Synth, MusicLineSynth, KlysSynth, DeltaMusic2Synth
// ============================================================================
export const UADE_PLAYBACK_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Playback
  { id: 'uade.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'uade.subsong', name: 'Subsong', section: NKSSection.SEQUENCER, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Subsong Selection' },
];

// ============================================================================
// 1. SoundMonSynth — SoundMonConfig
// ============================================================================
export const SOUNDMON_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Waveform, Envelope & Vibrato
  { id: 'soundmon.waveType', name: 'Wave Type', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Waveform Type' },
  { id: 'soundmon.waveSpeed', name: 'Wave Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Waveform Speed' },
  { id: 'soundmon.attackVolume', name: 'Attack Vol', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 104, isAutomatable: true, accessibilityName: 'Attack Volume' },
  { id: 'soundmon.decayVolume', name: 'Decay Vol', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 105, isAutomatable: true, accessibilityName: 'Decay Volume' },
  { id: 'soundmon.sustainVolume', name: 'Sustain Vol', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.4, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 106, isAutomatable: true, accessibilityName: 'Sustain Volume' },
  { id: 'soundmon.releaseVolume', name: 'Release Vol', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 107, isAutomatable: true, accessibilityName: 'Release Volume' },
  { id: 'soundmon.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 108, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'soundmon.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 109, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
];

// ============================================================================
// 2. SidMonSynth — SidMonConfig
// ============================================================================
export const SIDMON_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Waveform, Pulse, ADSR & Filter
  { id: 'sidmon.waveform', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Triangle', 'Sawtooth', 'Pulse', 'Noise'], page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Oscillator Waveform' },
  { id: 'sidmon.pulseWidth', name: 'Pulse Width', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Pulse Width' },
  { id: 'sidmon.attack', name: 'Attack', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 73, isAutomatable: true, accessibilityName: 'Envelope Attack' },
  { id: 'sidmon.decay', name: 'Decay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 75, isAutomatable: true, accessibilityName: 'Envelope Decay' },
  { id: 'sidmon.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 79, isAutomatable: true, accessibilityName: 'Envelope Sustain' },
  { id: 'sidmon.release', name: 'Release', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.3, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 72, isAutomatable: true, accessibilityName: 'Envelope Release' },
  { id: 'sidmon.filterCutoff', name: 'Filter Cut', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Cutoff Frequency' },
  { id: 'sidmon.filterResonance', name: 'Filter Res', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 71, isAutomatable: true, accessibilityName: 'Filter Resonance' },
  // Page 1: Filter Mode & Vibrato
  { id: 'sidmon.filterMode', name: 'Filter Mode', section: NKSSection.FILTER, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['Low Pass', 'Band Pass', 'High Pass'], page: 1, index: 0, ccNumber: 104, isAutomatable: true, accessibilityName: 'Filter Mode' },
  { id: 'sidmon.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'sidmon.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 106, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'sidmon.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 107, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
];

// ============================================================================
// 3. SidMon1Synth — SidMon1Config
// ============================================================================
export const SIDMON1_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Waveforms, Phase & Envelope
  { id: 'sidmon1.mainWave', name: 'Main Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Main Waveform' },
  { id: 'sidmon1.phaseWave', name: 'Phase Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Phase Modulation Waveform' },
  { id: 'sidmon1.phaseShift', name: 'Phase Shift', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 104, isAutomatable: true, accessibilityName: 'Phase Shift Amount' },
  { id: 'sidmon1.phaseSpeed', name: 'Phase Speed', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 105, isAutomatable: true, accessibilityName: 'Phase Modulation Speed' },
  { id: 'sidmon1.attackSpeed', name: 'Attack Spd', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Speed' },
  { id: 'sidmon1.decaySpeed', name: 'Decay Spd', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 75, isAutomatable: true, accessibilityName: 'Decay Speed' },
  { id: 'sidmon1.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 79, isAutomatable: true, accessibilityName: 'Sustain Level' },
  { id: 'sidmon1.releaseSpeed', name: 'Release Spd', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 72, isAutomatable: true, accessibilityName: 'Release Speed' },
  // Page 1: Tuning & Envelope Levels
  { id: 'sidmon1.finetune', name: 'Fine Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 106, isAutomatable: true, accessibilityName: 'Fine Tuning' },
  { id: 'sidmon1.pitchFall', name: 'Pitch Fall', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 107, isAutomatable: true, accessibilityName: 'Pitch Fall Amount' },
  { id: 'sidmon1.attackMax', name: 'Attack Max', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 108, isAutomatable: true, accessibilityName: 'Attack Maximum Level' },
  { id: 'sidmon1.decayMin', name: 'Decay Min', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 109, isAutomatable: true, accessibilityName: 'Decay Minimum Level' },
  { id: 'sidmon1.releaseMin', name: 'Release Min', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 110, isAutomatable: true, accessibilityName: 'Release Minimum Level' },
];

// ============================================================================
// 4. DigMugSynth — DigMugConfig
// ============================================================================
export const DIGMUG_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Wave, Volume, Arpeggio & Vibrato
  { id: 'digmug.waveBlend', name: 'Wave Blend', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Waveform Blend' },
  { id: 'digmug.waveSpeed', name: 'Wave Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Waveform Animation Speed' },
  { id: 'digmug.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'digmug.arpSpeed', name: 'Arp Speed', section: NKSSection.ARP, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Arpeggio Speed' },
  { id: 'digmug.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'digmug.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 106, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
];

// ============================================================================
// 5. FCSynth — FCConfig (Future Composer)
// ============================================================================
export const FC_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Waveform, Synthesis Speed, Envelope & Vibrato
  { id: 'fc.waveNumber', name: 'Wave Number', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 46, defaultValue: 0, page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Waveform Number' },
  { id: 'fc.synthSpeed', name: 'Synth Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Synthesis Speed' },
  { id: 'fc.attackLength', name: 'Atk Length', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.1, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Length' },
  { id: 'fc.attackVolume', name: 'Atk Volume', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Attack Volume' },
  { id: 'fc.decayLength', name: 'Dec Length', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 75, isAutomatable: true, accessibilityName: 'Decay Length' },
  { id: 'fc.decayVolume', name: 'Dec Volume', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 105, isAutomatable: true, accessibilityName: 'Decay Volume' },
  { id: 'fc.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 106, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'fc.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 107, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
];

// ============================================================================
// 6. FredSynth + FredEditorReplayerSynth — FredConfig
// ============================================================================
export const FRED_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Envelope
  { id: 'fred.envelopeVol', name: 'Env Volume', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Envelope Volume' },
  { id: 'fred.attackSpeed', name: 'Atk Speed', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Speed' },
  { id: 'fred.attackVolume', name: 'Atk Volume', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true, accessibilityName: 'Attack Volume' },
  { id: 'fred.decaySpeed', name: 'Dec Speed', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 75, isAutomatable: true, accessibilityName: 'Decay Speed' },
  { id: 'fred.decayVolume', name: 'Dec Volume', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 103, isAutomatable: true, accessibilityName: 'Decay Volume' },
  { id: 'fred.sustainTime', name: 'Sus Time', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 79, isAutomatable: true, accessibilityName: 'Sustain Time' },
  { id: 'fred.releaseSpeed', name: 'Rel Speed', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 72, isAutomatable: true, accessibilityName: 'Release Speed' },
  { id: 'fred.releaseVolume', name: 'Rel Volume', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 104, isAutomatable: true, accessibilityName: 'Release Volume' },
  // Page 1: Vibrato, Arpeggio & Pulse
  { id: 'fred.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'fred.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 106, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'fred.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 107, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'fred.arpeggioSpeed', name: 'Arp Speed', section: NKSSection.ARP, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 108, isAutomatable: true, accessibilityName: 'Arpeggio Speed' },
  { id: 'fred.arpeggioLimit', name: 'Arp Limit', section: NKSSection.ARP, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 109, isAutomatable: true, accessibilityName: 'Arpeggio Limit' },
  { id: 'fred.pulseSpeed', name: 'Pulse Speed', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 110, isAutomatable: true, accessibilityName: 'Pulse Modulation Speed' },
  { id: 'fred.pulseDelay', name: 'Pulse Delay', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 6, ccNumber: 111, isAutomatable: true, accessibilityName: 'Pulse Modulation Delay' },
  { id: 'fred.relative', name: 'Relative', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 1, index: 7, ccNumber: 112, isAutomatable: true, accessibilityName: 'Relative Pitch Mode' },
];

// ============================================================================
// 7. TFMXSynth — TFMXConfig (playback-only, minimal)
// ============================================================================
export const TFMX_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Playback
  { id: 'tfmx.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Master Volume' },
  { id: 'tfmx.subsong', name: 'Subsong', section: NKSSection.SEQUENCER, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Subsong Selection' },
];

// ============================================================================
// 8. HippelCoSoSynth — HippelCoSoConfig
// ============================================================================
export const HIPPELCOSO_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume & Vibrato
  { id: 'hippelcoso.volSpeed', name: 'Vol Speed', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Volume Envelope Speed' },
  { id: 'hippelcoso.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'hippelcoso.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 104, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'hippelcoso.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
];

// ============================================================================
// 9. RobHubbardSynth — RobHubbardConfig
// ============================================================================
export const ROBHUBBARD_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Sample & Vibrato
  { id: 'robhubbard.sampleVolume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Sample Volume' },
  { id: 'robhubbard.relative', name: 'Relative', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Relative Pitch Mode' },
  { id: 'robhubbard.divider', name: 'Divider', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 103, isAutomatable: true, accessibilityName: 'Clock Divider' },
  { id: 'robhubbard.vibratoIdx', name: 'Vibrato Idx', section: NKSSection.LFO, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Vibrato Table Index' },
];

// ============================================================================
// 10. SteveTurnerSynth — SteveTurnerConfig
// ============================================================================
export const STEVETURNER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Envelopes, Pitch & Oscillator
  { id: 'steveturner.env1Duration', name: 'Env1 Dur', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Envelope 1 Duration' },
  { id: 'steveturner.env1Delta', name: 'Env1 Delta', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Envelope 1 Delta' },
  { id: 'steveturner.env2Duration', name: 'Env2 Dur', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 104, isAutomatable: true, accessibilityName: 'Envelope 2 Duration' },
  { id: 'steveturner.env2Delta', name: 'Env2 Delta', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 105, isAutomatable: true, accessibilityName: 'Envelope 2 Delta' },
  { id: 'steveturner.pitchShift', name: 'Pitch Shft', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 7, defaultValue: 0, page: 0, index: 4, ccNumber: 106, isAutomatable: true, accessibilityName: 'Pitch Shift' },
  { id: 'steveturner.oscCount', name: 'Osc Count', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 107, isAutomatable: true, accessibilityName: 'Oscillator Count' },
  { id: 'steveturner.oscDelta', name: 'Osc Delta', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 108, isAutomatable: true, accessibilityName: 'Oscillator Delta' },
  { id: 'steveturner.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 109, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  // Page 1: Vibrato, Init, Oscillator Loop & Chain
  { id: 'steveturner.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 110, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'steveturner.vibratoMaxDepth', name: 'Vib MaxDep', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 111, isAutomatable: true, accessibilityName: 'Vibrato Maximum Depth' },
  { id: 'steveturner.initDelay', name: 'Init Delay', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 112, isAutomatable: true, accessibilityName: 'Initial Delay' },
  { id: 'steveturner.oscLoop', name: 'Osc Loop', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 113, isAutomatable: true, accessibilityName: 'Oscillator Loop' },
  { id: 'steveturner.decayDelta', name: 'Decay Delta', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 114, isAutomatable: true, accessibilityName: 'Decay Delta' },
  { id: 'steveturner.chain', name: 'Chain', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 115, isAutomatable: true, accessibilityName: 'Instrument Chain' },
  { id: 'steveturner.priority', name: 'Priority', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 6, ccNumber: 116, isAutomatable: true, accessibilityName: 'Channel Priority' },
];

// ============================================================================
// 11. DavidWhittakerSynth — DavidWhittakerConfig
// ============================================================================
export const DAVIDWHITTAKER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume, Relative & Vibrato
  { id: 'davidwhittaker.defaultVolume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Default Volume' },
  { id: 'davidwhittaker.relative', name: 'Relative', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Relative Pitch Mode' },
  { id: 'davidwhittaker.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 103, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'davidwhittaker.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
];

// ============================================================================
// 12. SymphonieSynth — SymphonieConfig
// ============================================================================
export const SYMPHONIE_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume, Tuning, DSP & Looping
  { id: 'symphonie.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'symphonie.tune', name: 'Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Coarse Tuning' },
  { id: 'symphonie.fineTune', name: 'Fine Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 103, isAutomatable: true, accessibilityName: 'Fine Tuning' },
  { id: 'symphonie.noDsp', name: 'No DSP', section: NKSSection.EFFECTS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Bypass DSP Processing' },
  { id: 'symphonie.multiChannel', name: 'Multi Chan', section: NKSSection.OUTPUT, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Mono', 'Stereo', 'Quad L', 'Quad R'], page: 0, index: 4, ccNumber: 105, isAutomatable: true, accessibilityName: 'Multi Channel Mode' },
  { id: 'symphonie.loopStart', name: 'Loop Start', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 106, isAutomatable: true, accessibilityName: 'Sample Loop Start' },
  { id: 'symphonie.loopLen', name: 'Loop Len', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 107, isAutomatable: true, accessibilityName: 'Sample Loop Length' },
  { id: 'symphonie.sampledFrequency', name: 'Samp Freq', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 108, isAutomatable: true, accessibilityName: 'Sampled Frequency' },
];

// ============================================================================
// 13. DeltaMusic1Synth — DeltaMusic1Config
// ============================================================================
export const DELTAMUSIC1_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume & Envelope
  { id: 'deltamusic1.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'deltamusic1.attackStep', name: 'Atk Step', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Step Size' },
  { id: 'deltamusic1.attackDelay', name: 'Atk Delay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true, accessibilityName: 'Attack Delay' },
  { id: 'deltamusic1.decayStep', name: 'Dec Step', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 75, isAutomatable: true, accessibilityName: 'Decay Step Size' },
  { id: 'deltamusic1.decayDelay', name: 'Dec Delay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 103, isAutomatable: true, accessibilityName: 'Decay Delay' },
  { id: 'deltamusic1.sustain', name: 'Sustain', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 79, isAutomatable: true, accessibilityName: 'Sustain Level' },
  { id: 'deltamusic1.releaseStep', name: 'Rel Step', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 72, isAutomatable: true, accessibilityName: 'Release Step Size' },
  { id: 'deltamusic1.releaseDelay', name: 'Rel Delay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 104, isAutomatable: true, accessibilityName: 'Release Delay' },
  // Page 1: Vibrato, Bend & Portamento
  { id: 'deltamusic1.vibratoWait', name: 'Vib Wait', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Wait Time' },
  { id: 'deltamusic1.vibratoStep', name: 'Vib Step', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 106, isAutomatable: true, accessibilityName: 'Vibrato Step Size' },
  { id: 'deltamusic1.vibratoLength', name: 'Vib Length', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 107, isAutomatable: true, accessibilityName: 'Vibrato Length' },
  { id: 'deltamusic1.bendRate', name: 'Bend Rate', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 108, isAutomatable: true, accessibilityName: 'Pitch Bend Rate' },
  { id: 'deltamusic1.portamento', name: 'Portamento', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 5, isAutomatable: true, accessibilityName: 'Portamento Time' },
  { id: 'deltamusic1.tableDelay', name: 'Table Delay', section: NKSSection.SEQUENCER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 109, isAutomatable: true, accessibilityName: 'Wavetable Delay' },
];

// ============================================================================
// 14. DeltaMusic2Synth — DeltaMusic2Config (minimal)
// ============================================================================
export const DELTAMUSIC2_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Pitch Bend & Volume
  { id: 'deltamusic2.pitchBend', name: 'Pitch Bend', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Pitch Bend Amount' },
  { id: 'deltamusic2.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
];

// ============================================================================
// 15. SonicArrangerSynth — SonicArrangerConfig
// ============================================================================
export const SONICARRANGER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Core Synthesis & Vibrato
  { id: 'sonicarranger.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'sonicarranger.fineTuning', name: 'Fine Tune', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Fine Tuning' },
  { id: 'sonicarranger.portamentoSpeed', name: 'Porta Speed', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 5, isAutomatable: true, accessibilityName: 'Portamento Speed' },
  { id: 'sonicarranger.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 103, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'sonicarranger.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 104, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'sonicarranger.vibratoLevel', name: 'Vib Level', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Level' },
  { id: 'sonicarranger.sustainPoint', name: 'Sus Point', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 106, isAutomatable: true, accessibilityName: 'Sustain Point' },
  { id: 'sonicarranger.sustainDelay', name: 'Sus Delay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 107, isAutomatable: true, accessibilityName: 'Sustain Delay' },
  // Page 1: AMF, ADSR Tables & Effect
  { id: 'sonicarranger.amfNumber', name: 'AMF Number', section: NKSSection.MODULATION, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 1, index: 0, ccNumber: 108, isAutomatable: true, accessibilityName: 'Amplitude Modulation Function Number' },
  { id: 'sonicarranger.amfDelay', name: 'AMF Delay', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 109, isAutomatable: true, accessibilityName: 'Amplitude Modulation Function Delay' },
  { id: 'sonicarranger.amfLength', name: 'AMF Length', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 110, isAutomatable: true, accessibilityName: 'Amplitude Modulation Function Length' },
  { id: 'sonicarranger.adsrNumber', name: 'ADSR Number', section: NKSSection.ENVELOPE, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 1, index: 3, ccNumber: 111, isAutomatable: true, accessibilityName: 'ADSR Table Number' },
  { id: 'sonicarranger.adsrDelay', name: 'ADSR Delay', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 112, isAutomatable: true, accessibilityName: 'ADSR Table Delay' },
  { id: 'sonicarranger.adsrLength', name: 'ADSR Length', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 113, isAutomatable: true, accessibilityName: 'ADSR Table Length' },
  { id: 'sonicarranger.effect', name: 'Effect', section: NKSSection.EFFECTS, type: NKSParameterType.INT, min: 0, max: 1, defaultValue: 0, page: 1, index: 6, ccNumber: 114, isAutomatable: true, accessibilityName: 'Effect Type' },
  { id: 'sonicarranger.effectDelay', name: 'Eff Delay', section: NKSSection.EFFECTS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 7, ccNumber: 115, isAutomatable: true, accessibilityName: 'Effect Delay' },
];

// ============================================================================
// 16. InStereo2Synth + InStereo1Synth — InStereo2Config
// ============================================================================
export const INSTEREO_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume, Portamento, Vibrato & Envelope Gate
  { id: 'instereo.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'instereo.portamentoSpeed', name: 'Porta Speed', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 5, isAutomatable: true, accessibilityName: 'Portamento Speed' },
  { id: 'instereo.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'instereo.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 103, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'instereo.vibratoLevel', name: 'Vib Level', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 104, isAutomatable: true, accessibilityName: 'Vibrato Level' },
  { id: 'instereo.sustainPoint', name: 'Sus Point', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 105, isAutomatable: true, accessibilityName: 'Sustain Point' },
  { id: 'instereo.sustainSpeed', name: 'Sus Speed', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 106, isAutomatable: true, accessibilityName: 'Sustain Speed' },
  { id: 'instereo.egMode', name: 'EG Mode', section: NKSSection.ENVELOPE, type: NKSParameterType.SELECTOR, min: 0, max: 2, defaultValue: 0, valueStrings: ['Normal', 'Loop', 'One-Shot'], page: 0, index: 7, ccNumber: 107, isAutomatable: true, accessibilityName: 'Envelope Generator Mode' },
  // Page 1: ADSR/AMF Tables & EG Speed
  { id: 'instereo.adsrLength', name: 'ADSR Len', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 108, isAutomatable: true, accessibilityName: 'ADSR Table Length' },
  { id: 'instereo.adsrRepeat', name: 'ADSR Rpt', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 109, isAutomatable: true, accessibilityName: 'ADSR Table Repeat' },
  { id: 'instereo.amfLength', name: 'AMF Length', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 110, isAutomatable: true, accessibilityName: 'Amplitude Modulation Function Length' },
  { id: 'instereo.amfRepeat', name: 'AMF Repeat', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 111, isAutomatable: true, accessibilityName: 'Amplitude Modulation Function Repeat' },
  { id: 'instereo.egSpeedUp', name: 'EG Spd Up', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 112, isAutomatable: true, accessibilityName: 'Envelope Generator Speed Up' },
  { id: 'instereo.egSpeedDown', name: 'EG Spd Down', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 113, isAutomatable: true, accessibilityName: 'Envelope Generator Speed Down' },
];

// ============================================================================
// 17. JamCrackerSynth — JamCrackerConfig
// ============================================================================
export const JAMCRACKER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume, Phase & Modulation Flags
  { id: 'jamcracker.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'jamcracker.phaseDelta', name: 'Phase Delta', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Phase Delta' },
  { id: 'jamcracker.isAM', name: 'AM Mode', section: NKSSection.MODULATION, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 2, ccNumber: 103, isAutomatable: true, accessibilityName: 'Amplitude Modulation Mode' },
  { id: 'jamcracker.hasLoop', name: 'Loop', section: NKSSection.SYNTHESIS, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Sample Loop Enable' },
];

// ============================================================================
// 18. FuturePlayerSynth — FuturePlayerConfig
// ============================================================================
export const FUTUREPLAYER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume & ADSR Envelope
  { id: 'futureplayer.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'futureplayer.attackRate', name: 'Atk Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Rate' },
  { id: 'futureplayer.attackPeak', name: 'Atk Peak', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true, accessibilityName: 'Attack Peak Level' },
  { id: 'futureplayer.decayRate', name: 'Dec Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 75, isAutomatable: true, accessibilityName: 'Decay Rate' },
  { id: 'futureplayer.sustainLevel', name: 'Sus Level', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 79, isAutomatable: true, accessibilityName: 'Sustain Level' },
  { id: 'futureplayer.sustainRate', name: 'Sus Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 103, isAutomatable: true, accessibilityName: 'Sustain Rate' },
  { id: 'futureplayer.sustainTarget', name: 'Sus Target', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 104, isAutomatable: true, accessibilityName: 'Sustain Target Level' },
  { id: 'futureplayer.releaseRate', name: 'Rel Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 72, isAutomatable: true, accessibilityName: 'Release Rate' },
  // Page 1: Pitch & Sample Modulation
  { id: 'futureplayer.pitchMod1Delay', name: 'PM1 Delay', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 105, isAutomatable: true, accessibilityName: 'Pitch Modulation 1 Delay' },
  { id: 'futureplayer.pitchMod1Shift', name: 'PM1 Shift', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 106, isAutomatable: true, accessibilityName: 'Pitch Modulation 1 Shift' },
  { id: 'futureplayer.pitchMod2Delay', name: 'PM2 Delay', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 107, isAutomatable: true, accessibilityName: 'Pitch Modulation 2 Delay' },
  { id: 'futureplayer.pitchMod2Shift', name: 'PM2 Shift', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 3, ccNumber: 108, isAutomatable: true, accessibilityName: 'Pitch Modulation 2 Shift' },
  { id: 'futureplayer.sampleMod1Delay', name: 'SM1 Delay', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 109, isAutomatable: true, accessibilityName: 'Sample Modulation 1 Delay' },
  { id: 'futureplayer.sampleMod1Shift', name: 'SM1 Shift', section: NKSSection.MODULATION, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 5, ccNumber: 110, isAutomatable: true, accessibilityName: 'Sample Modulation 1 Shift' },
];

// ============================================================================
// 19. OctaMEDSynth — OctaMEDConfig
// ============================================================================
export const OCTAMED_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume & Modulation Speeds
  { id: 'octamed.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'octamed.voltblSpeed', name: 'VolTbl Spd', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Volume Table Speed' },
  { id: 'octamed.wfSpeed', name: 'WF Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 103, isAutomatable: true, accessibilityName: 'Waveform Speed' },
  { id: 'octamed.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
];

// ============================================================================
// 20. StartrekkerAMSynth — StartrekkerAMConfig
// ============================================================================
export const STARTREKKER_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Waveform, Envelope & Vibrato
  { id: 'startrekker.waveform', name: 'Waveform', section: NKSSection.SYNTHESIS, type: NKSParameterType.SELECTOR, min: 0, max: 3, defaultValue: 0, valueStrings: ['Sine', 'Sawtooth', 'Square', 'Noise'], page: 0, index: 0, ccNumber: 102, isAutomatable: true, accessibilityName: 'Oscillator Waveform' },
  { id: 'startrekker.attackTarget', name: 'Atk Target', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 1.0, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 103, isAutomatable: true, accessibilityName: 'Attack Target Level' },
  { id: 'startrekker.attackRate', name: 'Atk Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 73, isAutomatable: true, accessibilityName: 'Attack Rate' },
  { id: 'startrekker.decayTarget', name: 'Dec Target', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Decay Target Level' },
  { id: 'startrekker.decayRate', name: 'Dec Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 75, isAutomatable: true, accessibilityName: 'Decay Rate' },
  { id: 'startrekker.sustainCount', name: 'Sus Count', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 79, isAutomatable: true, accessibilityName: 'Sustain Hold Count' },
  { id: 'startrekker.releaseRate', name: 'Rel Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 72, isAutomatable: true, accessibilityName: 'Release Rate' },
  { id: 'startrekker.vibratoAmplitude', name: 'Vib Amp', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 105, isAutomatable: true, accessibilityName: 'Vibrato Amplitude' },
  // Page 1: Attack2 & Additional Modulation
  { id: 'startrekker.attack2Target', name: 'Atk2 Target', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 106, isAutomatable: true, accessibilityName: 'Attack 2 Target Level' },
  { id: 'startrekker.attack2Rate', name: 'Atk2 Rate', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 107, isAutomatable: true, accessibilityName: 'Attack 2 Rate' },
  { id: 'startrekker.vibratoFreqStep', name: 'Vib FqStep', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 108, isAutomatable: true, accessibilityName: 'Vibrato Frequency Step' },
  { id: 'startrekker.periodShift', name: 'Period Shft', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 15, defaultValue: 0, page: 1, index: 3, ccNumber: 109, isAutomatable: true, accessibilityName: 'Period Shift' },
];

// ============================================================================
// 21. GTUltraSynth — GTUltraConfig (GoatTracker Ultra / SID)
// ============================================================================
export const GTULTRA_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: SID Envelope & Vibrato
  { id: 'gtultra.ad', name: 'Attack/Dec', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 73, isAutomatable: true, accessibilityName: 'SID Attack and Decay' },
  { id: 'gtultra.sr', name: 'Sus/Rel', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 1, ccNumber: 72, isAutomatable: true, accessibilityName: 'SID Sustain and Release' },
  { id: 'gtultra.vibdelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 102, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'gtultra.gatetimer', name: 'Gate Timer', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.5, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 103, isAutomatable: true, accessibilityName: 'Gate Timer Duration' },
  { id: 'gtultra.firstwave', name: 'First Wave', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 104, isAutomatable: true, accessibilityName: 'First Wave Register' },
];

// ============================================================================
// 22. HivelySynth — HivelyConfig
// ============================================================================
export const HIVELY_NKS_PARAMETERS: NKSParameter[] = [
  // Page 0: Volume, Waveform, Filter & Square Modulation
  { id: 'hively.volume', name: 'Volume', section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.7, unit: '%', formatString: '%.0f%%', page: 0, index: 0, ccNumber: 7, isAutomatable: true, accessibilityName: 'Channel Volume' },
  { id: 'hively.waveLength', name: 'Wave Len', section: NKSSection.SYNTHESIS, type: NKSParameterType.INT, min: 0, max: 5, defaultValue: 3, page: 0, index: 1, ccNumber: 102, isAutomatable: true, accessibilityName: 'Waveform Length' },
  { id: 'hively.filterLowerLimit', name: 'Flt Lower', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 2, ccNumber: 103, isAutomatable: true, accessibilityName: 'Filter Lower Limit' },
  { id: 'hively.filterUpperLimit', name: 'Flt Upper', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 3, ccNumber: 104, isAutomatable: true, accessibilityName: 'Filter Upper Limit' },
  { id: 'hively.filterSpeed', name: 'Flt Speed', section: NKSSection.FILTER, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 4, ccNumber: 74, isAutomatable: true, accessibilityName: 'Filter Speed' },
  { id: 'hively.squareLowerLimit', name: 'Sq Lower', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 5, ccNumber: 105, isAutomatable: true, accessibilityName: 'Square Modulation Lower Limit' },
  { id: 'hively.squareUpperLimit', name: 'Sq Upper', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 6, ccNumber: 106, isAutomatable: true, accessibilityName: 'Square Modulation Upper Limit' },
  { id: 'hively.squareSpeed', name: 'Sq Speed', section: NKSSection.SYNTHESIS, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 0, index: 7, ccNumber: 107, isAutomatable: true, accessibilityName: 'Square Modulation Speed' },
  // Page 1: Vibrato & Hard Cut
  { id: 'hively.vibratoDelay', name: 'Vib Delay', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 0, ccNumber: 108, isAutomatable: true, accessibilityName: 'Vibrato Delay' },
  { id: 'hively.vibratoSpeed', name: 'Vib Speed', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 1, ccNumber: 109, isAutomatable: true, accessibilityName: 'Vibrato Speed' },
  { id: 'hively.vibratoDepth', name: 'Vib Depth', section: NKSSection.LFO, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 2, ccNumber: 110, isAutomatable: true, accessibilityName: 'Vibrato Depth' },
  { id: 'hively.hardCutRelease', name: 'HardCut Rel', section: NKSSection.ENVELOPE, type: NKSParameterType.BOOLEAN, min: 0, max: 1, defaultValue: 0, page: 1, index: 3, ccNumber: 111, isAutomatable: true, accessibilityName: 'Hard Cut Release Enable' },
  { id: 'hively.hardCutReleaseFrames', name: 'HardCut Frm', section: NKSSection.ENVELOPE, type: NKSParameterType.FLOAT, min: 0, max: 1, defaultValue: 0.0, unit: '%', formatString: '%.0f%%', page: 1, index: 4, ccNumber: 112, isAutomatable: true, accessibilityName: 'Hard Cut Release Frames' },
];

// ============================================================================
// Lookup map: SynthType string → NKS parameter array
// ============================================================================

/**
 * Maps UADE/exotic synth type identifiers to their NKS parameter definitions.
 * Used by synthParameterMaps.ts to wire up controller/automation support.
 */
export const UADE_PARAMETER_MAP: Record<string, NKSParameter[]> = {
  // Dedicated parameter maps
  'SoundMonSynth': SOUNDMON_NKS_PARAMETERS,
  'SidMonSynth': SIDMON_NKS_PARAMETERS,
  'SidMon1Synth': SIDMON1_NKS_PARAMETERS,
  'DigMugSynth': DIGMUG_NKS_PARAMETERS,
  'FCSynth': FC_NKS_PARAMETERS,
  'FredSynth': FRED_NKS_PARAMETERS,
  'FredEditorReplayerSynth': FRED_NKS_PARAMETERS,
  'TFMXSynth': TFMX_NKS_PARAMETERS,
  'HippelCoSoSynth': HIPPELCOSO_NKS_PARAMETERS,
  'RobHubbardSynth': ROBHUBBARD_NKS_PARAMETERS,
  'SteveTurnerSynth': STEVETURNER_NKS_PARAMETERS,
  'DavidWhittakerSynth': DAVIDWHITTAKER_NKS_PARAMETERS,
  'SymphonieSynth': SYMPHONIE_NKS_PARAMETERS,
  'DeltaMusic1Synth': DELTAMUSIC1_NKS_PARAMETERS,
  'DeltaMusic2Synth': DELTAMUSIC2_NKS_PARAMETERS,
  'SonicArrangerSynth': SONICARRANGER_NKS_PARAMETERS,
  'InStereo2Synth': INSTEREO_NKS_PARAMETERS,
  'InStereo1Synth': INSTEREO_NKS_PARAMETERS,
  'JamCrackerSynth': JAMCRACKER_NKS_PARAMETERS,
  'FuturePlayerSynth': FUTUREPLAYER_NKS_PARAMETERS,
  'OctaMEDSynth': OCTAMED_NKS_PARAMETERS,
  'StartrekkerAMSynth': STARTREKKER_NKS_PARAMETERS,
  'GTUltraSynth': GTULTRA_NKS_PARAMETERS,
  'HivelySynth': HIVELY_NKS_PARAMETERS,

  // Catch-all / playback-only synths
  'UADESynth': UADE_PLAYBACK_NKS_PARAMETERS,
  'Sc68Synth': UADE_PLAYBACK_NKS_PARAMETERS,
  'MusicLineSynth': UADE_PLAYBACK_NKS_PARAMETERS,
  'KlysSynth': UADE_PLAYBACK_NKS_PARAMETERS,
};
