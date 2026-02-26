/**
 * RobHubbardSynth.ts — DevilboxSynth wrapper for Rob Hubbard WASM engine
 *
 * Implements per-note triggering for Rob Hubbard instruments.
 * Each RobHubbardSynth instance owns one rh_create_player() handle.
 *
 * Binary serialisation format for rh_load_instrument() matches robhubbard_synth.c:
 *   [0]       version byte (0)
 *   [1..2]    sampleLen    (uint16 LE)
 *   [3..4]    loopOffset   (int16 LE; <0 = no loop)
 *   [5..6]    sampleVolume (uint16 LE, 0-64)
 *   [7..8]    relative     (uint16 LE)
 *   [9..10]   divider      (uint16 LE; 0 = no vibrato)
 *   [11..12]  vibratoIdx   (uint16 LE)
 *   [13..14]  hiPos        (uint16 LE; 0 = no wobble)
 *   [15..16]  loPos        (uint16 LE)
 *   [17..18]  vibratoLen   (uint16 LE)
 *   [19..19+vibratoLen-1]  vibrato table (signed int8 as uint8)
 *   [19+vibratoLen..]      sample PCM (signed int8 as uint8)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { RobHubbardConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { RobHubbardEngine } from './RobHubbardEngine';

export class RobHubbardSynth implements DevilboxSynth {
  readonly name = 'RobHubbardSynth';
  readonly output: GainNode;

  private engine: RobHubbardEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = RobHubbardEngine.getInstance();

    if (!RobHubbardSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      RobHubbardSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: RobHubbardConfig): Promise<void> {
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
    const blob = serializeRobHubbardConfig(config);
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
      case 'portaSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 1,
            value: Math.max(-1, Math.min(1, value / 127)),
          });
        }
        break;
      case 'divider':
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

  getEngine(): RobHubbardEngine {
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
      RobHubbardSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a RobHubbardConfig into the binary format expected by rh_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 */
export function serializeRobHubbardConfig(cfg: RobHubbardConfig): ArrayBuffer {
  const vibTable = cfg.vibTable ?? [];
  const sampleData = cfg.sampleData ?? [];

  const vibLen = vibTable.length;
  const sampleLen = sampleData.length;

  /*
   * Layout:
   *   [0]       version = 0
   *   [1..2]    sampleLen (LE uint16)
   *   [3..4]    loopOffset (LE int16, stored as signed → unsigned)
   *   [5..6]    sampleVolume (LE uint16)
   *   [7..8]    relative (LE uint16)
   *   [9..10]   divider (LE uint16)
   *   [11..12]  vibratoIdx (LE uint16)
   *   [13..14]  hiPos (LE uint16)
   *   [15..16]  loPos (LE uint16)
   *   [17..18]  vibratoLen (LE uint16)
   *   [19..19+vibLen-1]   vibrato table (signed bytes stored as unsigned)
   *   [19+vibLen..]       sample PCM (signed bytes stored as unsigned)
   */
  const totalLen = 19 + vibLen + sampleLen;
  const buf = new Uint8Array(totalLen);

  buf[0] = 0; // version

  // sampleLen LE uint16
  buf[1] = sampleLen & 0xFF;
  buf[2] = (sampleLen >> 8) & 0xFF;

  // loopOffset LE int16 (convert signed to unsigned 16-bit)
  const loopOff = cfg.loopOffset ?? -1;
  const loopU16 = (loopOff < 0) ? (loopOff + 65536) : loopOff;
  buf[3] = loopU16 & 0xFF;
  buf[4] = (loopU16 >> 8) & 0xFF;

  // sampleVolume LE uint16
  const vol = Math.max(0, Math.min(64, cfg.sampleVolume ?? 64));
  buf[5] = vol & 0xFF;
  buf[6] = (vol >> 8) & 0xFF;

  // relative LE uint16
  const rel = cfg.relative ?? 1;
  buf[7] = rel & 0xFF;
  buf[8] = (rel >> 8) & 0xFF;

  // divider LE uint16
  const div = cfg.divider ?? 0;
  buf[9] = div & 0xFF;
  buf[10] = (div >> 8) & 0xFF;

  // vibratoIdx LE uint16
  const vibIdx = cfg.vibratoIdx ?? 0;
  buf[11] = vibIdx & 0xFF;
  buf[12] = (vibIdx >> 8) & 0xFF;

  // hiPos LE uint16
  const hiPos = cfg.hiPos ?? 0;
  buf[13] = hiPos & 0xFF;
  buf[14] = (hiPos >> 8) & 0xFF;

  // loPos LE uint16
  const loPos = cfg.loPos ?? 0;
  buf[15] = loPos & 0xFF;
  buf[16] = (loPos >> 8) & 0xFF;

  // vibratoLen LE uint16
  buf[17] = vibLen & 0xFF;
  buf[18] = (vibLen >> 8) & 0xFF;

  // vibrato table (signed → unsigned bytes)
  for (let i = 0; i < vibLen; i++) {
    buf[19 + i] = (vibTable[i] + 256) & 0xFF;
  }

  // sample PCM (signed → unsigned bytes)
  const pcmOff = 19 + vibLen;
  for (let i = 0; i < sampleLen; i++) {
    buf[pcmOff + i] = (sampleData[i] + 256) & 0xFF;
  }

  return buf.buffer;
}
