/**
 * SidMon1Synth.ts — DevilboxSynth wrapper for SidMon 1.0 WASM engine
 *
 * Implements per-note triggering for SidMon 1.0 instruments.
 * Each SidMon1Synth instance owns one sm1_create_player() handle.
 *
 * Binary serialisation format for sm1_load_instrument() (93 bytes):
 *   [0]       version = 0
 *   [1]       attackSpeed (uint8)
 *   [2]       attackMax   (uint8, 0-64)
 *   [3]       decaySpeed  (uint8)
 *   [4]       decayMin    (uint8, 0-64)
 *   [5]       sustain     (uint8, countdown ticks)
 *   [6]       releaseSpeed (uint8)
 *   [7]       releaseMin  (uint8, 0-64)
 *   [8]       phaseShift  (uint8, 0 = disabled)
 *   [9]       phaseSpeed  (uint8)
 *   [10..11]  finetune    (uint16 LE, 0-1005)
 *   [12]      pitchFall   (int8 as uint8)
 *   [13..28]  arpeggio[16] (16 uint8 values)
 *   [29..60]  mainWave[32] (32 int8 as uint8)
 *   [61..92]  phaseWave[32] (32 int8 as uint8)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { SidMon1Config } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SidMon1Engine } from './SidMon1Engine';

export class SidMon1Synth implements DevilboxSynth {
  readonly name = 'SidMon1Synth';
  readonly output: GainNode;

  private engine: SidMon1Engine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = SidMon1Engine.getInstance();

    if (!SidMon1Synth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      SidMon1Synth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: SidMon1Config): Promise<void> {
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
    const blob = serializeSidMon1Config(config);
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
      case 'attackMax':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 1,
            value: Math.max(0, Math.min(1, value / 64)),
          });
        }
        break;
      case 'decayMin':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 2,
            value: Math.max(0, Math.min(1, value / 64)),
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

  getEngine(): SidMon1Engine {
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
      SidMon1Synth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a SidMon1Config into the binary format expected by sm1_load_instrument().
 * Returns an ArrayBuffer (93 bytes) that can be transferred to the AudioWorklet.
 */
export function serializeSidMon1Config(cfg: SidMon1Config): ArrayBuffer {
  const buf = new Uint8Array(93);
  const view = new DataView(buf.buffer);

  /* [0]  version = 0 */
  buf[0] = 0;

  /* [1]  attackSpeed */
  buf[1] = (cfg.attackSpeed ?? 8) & 0xFF;

  /* [2]  attackMax (0-64) */
  buf[2] = Math.min(64, cfg.attackMax ?? 64) & 0xFF;

  /* [3]  decaySpeed */
  buf[3] = (cfg.decaySpeed ?? 4) & 0xFF;

  /* [4]  decayMin (0-64) */
  buf[4] = Math.min(64, cfg.decayMin ?? 32) & 0xFF;

  /* [5]  sustain */
  buf[5] = (cfg.sustain ?? 0) & 0xFF;

  /* [6]  releaseSpeed */
  buf[6] = (cfg.releaseSpeed ?? 4) & 0xFF;

  /* [7]  releaseMin (0-64) */
  buf[7] = Math.min(64, cfg.releaseMin ?? 0) & 0xFF;

  /* [8]  phaseShift */
  buf[8] = (cfg.phaseShift ?? 0) & 0xFF;

  /* [9]  phaseSpeed */
  buf[9] = (cfg.phaseSpeed ?? 0) & 0xFF;

  /* [10..11]  finetune (uint16 LE, 0-1005) */
  const ft = Math.max(0, Math.min(1005, cfg.finetune ?? 0));
  view.setUint16(10, ft, true);

  /* [12]  pitchFall (signed → unsigned byte) */
  buf[12] = ((cfg.pitchFall ?? 0) + 256) & 0xFF;

  /* [13..28]  arpeggio[16] */
  const arp = cfg.arpeggio ?? new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    buf[13 + i] = (arp[i] ?? 0) & 0xFF;
  }

  /* [29..60]  mainWave[32] (signed → unsigned) */
  const mw = cfg.mainWave ?? new Array(32).fill(0);
  for (let i = 0; i < 32; i++) {
    buf[29 + i] = ((mw[i] ?? 0) + 256) & 0xFF;
  }

  /* [61..92]  phaseWave[32] (signed → unsigned) */
  const pw = cfg.phaseWave ?? new Array(32).fill(0);
  for (let i = 0; i < 32; i++) {
    buf[61 + i] = ((pw[i] ?? 0) + 256) & 0xFF;
  }

  return buf.buffer;
}
