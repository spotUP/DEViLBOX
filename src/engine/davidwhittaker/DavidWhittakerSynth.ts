/**
 * DavidWhittakerSynth.ts — DevilboxSynth wrapper for David Whittaker WASM engine
 *
 * Implements per-note triggering for David Whittaker instruments.
 * Each DavidWhittakerSynth instance owns one dw_create_player() handle.
 *
 * Binary serialisation format for dw_load_instrument() matches davidwhittaker_synth.c:
 *   [0]         version = 0
 *   [1]         defaultVolume (0-64)
 *   [2]         relative_lo (relative & 0xFF)
 *   [3]         relative_hi ((relative >> 8) & 0xFF)
 *   [4]         vibratoSpeed (0-255)
 *   [5]         vibratoDepth (0-255)
 *   [6..7]      volseqLen (LE uint16)
 *   [8..]       volseq bytes (signed)
 *   [8+vl..9+vl] frqseqLen (LE uint16)
 *   [10+vl..]   frqseq bytes (signed)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { DavidWhittakerConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { DavidWhittakerEngine } from './DavidWhittakerEngine';

export class DavidWhittakerSynth implements DevilboxSynth {
  readonly name = 'DavidWhittakerSynth';
  readonly output: GainNode;

  private engine: DavidWhittakerEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = DavidWhittakerEngine.getInstance();

    if (!DavidWhittakerSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      DavidWhittakerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: DavidWhittakerConfig): Promise<void> {
    await this.engine.ready();

    // Destroy old player if we have one
    if (this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    // Create a new player
    this.engine.sendMessage({ type: 'createPlayer' });
    this._playerHandle = await this.engine.waitForPlayerHandle();

    // Serialize and upload instrument
    const blob = serializeDavidWhittakerConfig(config);
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
      case 'vibratoDepth':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 1,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'vibratoSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 2,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
    }
  }

  get(param: string): number | undefined {
    switch (param) {
      case 'volume':
        return this.output.gain.value;
    }
    return undefined;
  }

  getEngine(): DavidWhittakerEngine {
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
      DavidWhittakerSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a DavidWhittakerConfig into the binary format expected by dw_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 */
export function serializeDavidWhittakerConfig(cfg: DavidWhittakerConfig): ArrayBuffer {
  const volseq = cfg.volseq ?? [64, -128, 0];
  const frqseq = cfg.frqseq ?? [-128, 0];
  const relative = cfg.relative ?? 8364;

  /* Layout:
   * [0]         version = 0
   * [1]         defaultVolume
   * [2]         relative_lo
   * [3]         relative_hi
   * [4]         vibratoSpeed
   * [5]         vibratoDepth
   * [6..7]      volseqLen (LE uint16)
   * [8..8+vl-1] volseq bytes
   * [8+vl..9+vl] frqseqLen (LE uint16)
   * [10+vl..]   frqseq bytes
   */
  const vl = volseq.length;
  const fl = frqseq.length;
  const totalLen = 8 + vl + 2 + fl;
  const buf = new Uint8Array(totalLen);

  buf[0] = 0; // version
  buf[1] = Math.max(0, Math.min(64, cfg.defaultVolume ?? 64)) & 0xFF;
  buf[2] = relative & 0xFF;
  buf[3] = (relative >> 8) & 0xFF;
  buf[4] = (cfg.vibratoSpeed ?? 0) & 0xFF;
  buf[5] = (cfg.vibratoDepth ?? 0) & 0xFF;

  // volseqLen LE uint16
  buf[6] = vl & 0xFF;
  buf[7] = (vl >> 8) & 0xFF;

  // volseq data (signed → unsigned byte)
  for (let i = 0; i < vl; i++) {
    buf[8 + i] = (volseq[i] + 256) & 0xFF;
  }

  const frqLenOff = 8 + vl;
  buf[frqLenOff]     = fl & 0xFF;
  buf[frqLenOff + 1] = (fl >> 8) & 0xFF;

  // frqseq data (signed → unsigned byte)
  const frqOff = frqLenOff + 2;
  for (let i = 0; i < fl; i++) {
    buf[frqOff + i] = (frqseq[i] + 256) & 0xFF;
  }

  return buf.buffer;
}
