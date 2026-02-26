/**
 * FredSynth.ts — DevilboxSynth wrapper for Fred Editor PWM synthesis
 *
 * Implements per-note triggering for Fred Editor type-1 (PWM) instruments.
 * Each FredSynth instance owns one fred_create_player() handle.
 *
 * Binary blob layout for fred_load_instrument():
 *   [0]       envelopeVol   (uint8)
 *   [1]       attackSpeed   (uint8)
 *   [2]       attackVol     (uint8)
 *   [3]       decaySpeed    (uint8)
 *   [4]       decayVol      (uint8)
 *   [5]       sustainTime   (uint8)
 *   [6]       releaseSpeed  (uint8)
 *   [7]       releaseVol    (uint8)
 *   [8]       vibratoDelay  (uint8)
 *   [9]       vibratoSpeed  (uint8)
 *   [10]      vibratoDepth  (uint8)
 *   [11]      arpeggioLimit (uint8)
 *   [12]      arpeggioSpeed (uint8)
 *   [13]      pulseRateNeg  (int8 as uint8)
 *   [14]      pulseRatePos  (uint8)
 *   [15]      pulseSpeed    (uint8)
 *   [16]      pulsePosL     (uint8)
 *   [17]      pulsePosH     (uint8)
 *   [18]      pulseDelay    (uint8)
 *   [19..34]  arpeggio[16]  (int8 array)
 *   [35..36]  relative      (uint16 LE)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { FredConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { FredEngine } from './FredEngine';

export class FredSynth implements DevilboxSynth {
  readonly name = 'FredSynth';
  readonly output: GainNode;

  private engine: FredEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;
  private _config: FredConfig | null = null;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = FredEngine.getInstance();

    if (!FredSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      FredSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: FredConfig): Promise<void> {
    this._config = config;

    await this.engine.ready();

    if (this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    this.engine.sendMessage({ type: 'createPlayer' });
    this._playerHandle = await this.engine.waitForPlayerHandle();

    const blob = serializeFredConfig(config);
    this.engine.sendMessage(
      { type: 'loadInstrument', handle: this._playerHandle, buffer: blob },
      [blob],
    );
  }

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed || this._playerHandle < 0) return;

    let midiNote: number;
    if (typeof note === 'string') {
      midiNote = noteToMidi(note);
    } else if (typeof note === 'number') {
      midiNote = note;
    } else {
      midiNote = 48; // default C-3
    }

    const vel = Math.round((velocity ?? 0.8) * 127);

    this.engine.sendMessage({
      type: 'noteOn',
      handle: this._playerHandle,
      note: midiNote,
      velocity: vel,
    });
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed || this._playerHandle < 0) return;
    this.engine.sendMessage({ type: 'noteOff', handle: this._playerHandle });
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        break;
    }
  }

  get(param: string): number | undefined {
    if (param === 'volume') return this.output.gain.value;
    return undefined;
  }

  getEngine(): FredEngine {
    return this.engine;
  }

  dispose(): void {
    this._disposed = true;

    if (this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    if (this._ownsEngineConnection) {
      try {
        this.engine.output.disconnect(this.output);
      } catch { /* may already be disconnected */ }
      FredSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a FredConfig into the binary blob expected by fred_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 */
export function serializeFredConfig(cfg: FredConfig): ArrayBuffer {
  const BLOB_SIZE = 37;
  const buf = new Uint8Array(BLOB_SIZE);

  buf[0]  = cfg.envelopeVol  & 0xFF;
  buf[1]  = cfg.attackSpeed  & 0xFF;
  buf[2]  = cfg.attackVol    & 0xFF;
  buf[3]  = cfg.decaySpeed   & 0xFF;
  buf[4]  = cfg.decayVol     & 0xFF;
  buf[5]  = cfg.sustainTime  & 0xFF;
  buf[6]  = cfg.releaseSpeed & 0xFF;
  buf[7]  = cfg.releaseVol   & 0xFF;
  buf[8]  = cfg.vibratoDelay & 0xFF;
  buf[9]  = cfg.vibratoSpeed & 0xFF;
  buf[10] = cfg.vibratoDepth & 0xFF;
  buf[11] = cfg.arpeggioLimit & 0xFF;
  buf[12] = cfg.arpeggioSpeed & 0xFF;
  // pulseRateNeg is signed — store as raw int8 byte
  buf[13] = (cfg.pulseRateNeg < 0 ? cfg.pulseRateNeg + 256 : cfg.pulseRateNeg) & 0xFF;
  buf[14] = cfg.pulseRatePos & 0xFF;
  buf[15] = cfg.pulseSpeed   & 0xFF;
  buf[16] = cfg.pulsePosL    & 0xFF;
  buf[17] = cfg.pulsePosH    & 0xFF;
  buf[18] = cfg.pulseDelay   & 0xFF;

  for (let i = 0; i < 16; i++) {
    const v = cfg.arpeggio[i] ?? 0;
    buf[19 + i] = (v < 0 ? v + 256 : v) & 0xFF;
  }

  // relative uint16 LE
  const rel = cfg.relative & 0xFFFF;
  buf[35] = rel & 0xFF;
  buf[36] = (rel >> 8) & 0xFF;

  return buf.buffer;
}
