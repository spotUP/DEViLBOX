/**
 * SID voice register classifier.
 *
 * Polls C64SIDEngine.getVoiceState(voice) on each AutoDub tick and accumulates
 * waveform/frequency statistics to classify each of the 3 SID voices into a
 * ChannelRole without requiring audio capture.
 *
 * SID waveform bits (from control register >> 4):
 *   bit 3 (0x8) = NOISE     → percussion (hi-hat, snare, kick transient)
 *   bit 2 (0x4) = PULSE     → could be anything — use frequency for tiebreak
 *   bit 1 (0x2) = SAWTOOTH  → typically bass or lead
 *   bit 0 (0x1) = TRIANGLE  → typically lead or pad
 *
 * Frequency → Hz: register * 985248 / 16777216  (PAL C64 clock)
 *   < 300 Hz → bass range  (A1..D4 area)
 *   300-800  → mid (lead or chord)
 *   > 800 Hz → high lead
 *
 * Re-classifies every CLASSIFY_EVERY_BARS bars to catch arrangement changes
 * (e.g. a voice that plays bass in verse and arpeggio in chorus).
 */

import type { ChannelRole } from './MusicAnalysis';
import type { InstrumentType } from './AudioSetInstrumentMap';
import { useChannelTypeStore } from '@stores/useChannelTypeStore';
import type { C64SIDEngine } from '@engine/C64SIDEngine';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASSIFY_EVERY_BARS = 8;   // re-classify after accumulating 8 bars of data
const PAL_CLOCK            = 985248;
const FREQ_REGISTER_MAX    = 65535;

// Frequency thresholds (Hz)
const BASS_HZ_MAX          = 300;
const LEAD_HZ_MIN          = 600;

// Waveform bitmask values (register >> 4)
const WAVEFORM_NOISE       = 0x8;
const WAVEFORM_PULSE       = 0x4;

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoiceStats {
  totalFrames:  number;
  noiseFrames:  number;   // frames where NOISE waveform active
  pulseFrames:  number;   // frames where PULSE waveform active
  freqSum:      number;   // sum of frequency register values
  gateOnFrames: number;   // frames where gate bit is set
}

function emptyStats(): VoiceStats {
  return { totalFrames: 0, noiseFrames: 0, pulseFrames: 0, freqSum: 0, gateOnFrames: 0 };
}

// ── Classifier ────────────────────────────────────────────────────────────────

class SidVoiceClassifier {
  private stats: [VoiceStats, VoiceStats, VoiceStats] = [emptyStats(), emptyStats(), emptyStats()];
  private lastClassifiedBar = -99;

  /** Call this on every AutoDub tick when a SID engine is active. */
  tick(engine: C64SIDEngine, bar: number): void {
    for (let v = 0; v < 3; v++) {
      const state = engine.getVoiceState(v) as null | {
        waveform: number; frequency: number; gate: boolean;
      };
      if (!state) continue;
      const s = this.stats[v];
      s.totalFrames++;
      if (state.waveform & WAVEFORM_NOISE) s.noiseFrames++;
      if (state.waveform & WAVEFORM_PULSE) s.pulseFrames++;
      s.freqSum += Math.max(0, Math.min(FREQ_REGISTER_MAX, state.frequency ?? 0));
      if (state.gate) s.gateOnFrames++;
    }

    if (bar - this.lastClassifiedBar >= CLASSIFY_EVERY_BARS) {
      this.lastClassifiedBar = bar;
      this.flush();
    }
  }

  /** Derive and store roles from accumulated stats. */
  private flush(): void {
    const store = useChannelTypeStore.getState();

    for (let v = 0; v < 3; v++) {
      const s = this.stats[v];
      if (s.totalFrames === 0) continue;

      const noiseRatio = s.noiseFrames / s.totalFrames;
      const avgFreqReg = s.freqSum / s.totalFrames;
      const avgFreqHz  = (avgFreqReg * PAL_CLOCK) / 16777216;

      const { type, role } = classify(noiseRatio, avgFreqHz);
      void role; // role derived inside store via instrumentTypeToRole
      store.setChannelRole(v, type, 'register');

      // Reset stats for next window
      this.stats[v] = emptyStats();
    }
  }

  /** Reset when a new SID file is loaded. */
  reset(): void {
    this.stats = [emptyStats(), emptyStats(), emptyStats()];
    this.lastClassifiedBar = -99;
  }
}

function classify(noiseRatio: number, avgFreqHz: number): { type: InstrumentType; role: ChannelRole } {
  if (noiseRatio > 0.35) {
    // Predominantly noise waveform → percussion (hi-hat, snare, drum transients)
    return { type: 'percussion', role: 'percussion' };
  }
  if (avgFreqHz > 0 && avgFreqHz < BASS_HZ_MAX) {
    return { type: 'bass', role: 'bass' };
  }
  if (avgFreqHz >= LEAD_HZ_MIN) {
    return { type: 'synthesizer', role: 'lead' };
  }
  // Mid range — default to lead (SID melodies often sit here)
  return { type: 'synthesizer', role: 'lead' };
}

export const sidVoiceClassifier = new SidVoiceClassifier();
