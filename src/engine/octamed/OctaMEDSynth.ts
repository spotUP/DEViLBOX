/**
 * OctaMEDSynth.ts - DevilboxSynth wrapper for OctaMED synth instruments
 *
 * Executes the vol/wf command-table oscillator per note trigger.
 * Uses the WASM engine for real-time synthesis.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { OctaMEDConfig } from '@/types/instrument';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { OctaMEDEngine } from './OctaMEDEngine';

export class OctaMEDSynth implements DevilboxSynth {
  readonly name = 'OctaMEDSynth';
  readonly output: GainNode;

  private engine: OctaMEDEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = OctaMEDEngine.getInstance();

    if (!OctaMEDSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      OctaMEDSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: OctaMEDConfig): Promise<void> {
    await this.engine.ready();

    this.engine.sendMessage({ type: 'createPlayer' });
    this._playerHandle = await this.engine.waitForPlayerHandle();

    const insBuffer = OctaMEDSynth.serializeInstrument(config);
    this.engine.sendMessage(
      { type: 'setInstrument', handle: this._playerHandle, buffer: insBuffer },
      [insBuffer]
    );
  }

  /**
   * Serialize OctaMEDConfig to the compact binary format consumed by octamed_synth.c.
   *
   * Layout:
   *   [0]     version = 1
   *   [1]     numWaveforms
   *   [2]     defaultVolume
   *   [3]     vibratoSpeed
   *   [4]     voltblSpeed
   *   [5]     wfSpeed
   *   [6-7]   reserved
   *   [8]     voltbl (128 bytes)
   *   [136]   wftbl  (128 bytes)
   *   [264]   waveforms (numWaveforms × 256 signed bytes)
   */
  static serializeInstrument(config: OctaMEDConfig): ArrayBuffer {
    const numWf = Math.max(1, Math.min(10, config.waveforms.length));
    const total = 8 + 128 + 128 + numWf * 256;
    const buf = new Uint8Array(total);

    buf[0] = 1;                          // version
    buf[1] = numWf;
    buf[2] = config.volume & 0x3F;       // 0-64
    buf[3] = config.vibratoSpeed & 0xFF;
    buf[4] = config.voltblSpeed & 0xFF;
    buf[5] = config.wfSpeed & 0xFF;
    // buf[6-7] reserved (zero)

    // voltbl: 128 bytes at offset 8
    const voltbl = config.voltbl;
    for (let i = 0; i < 128; i++) {
      buf[8 + i] = voltbl[i] ?? 0xFF;
    }

    // wftbl: 128 bytes at offset 136
    const wftbl = config.wftbl;
    for (let i = 0; i < 128; i++) {
      buf[136 + i] = wftbl[i] ?? 0xFF;
    }

    // waveforms: numWf × 256 signed bytes at offset 264
    for (let w = 0; w < numWf; w++) {
      const wf = config.waveforms[w];
      const dst = new Uint8Array(buf.buffer, 264 + w * 256, 256);
      if (wf) {
        dst.set(new Uint8Array(wf.buffer, wf.byteOffset, Math.min(256, wf.byteLength)));
      }
    }

    return buf.buffer;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed || this._playerHandle < 0) return;

    let midiNote: number;
    if (typeof note === 'string') {
      midiNote = this.noteNameToMidi(note);
    } else if (typeof note === 'number') {
      midiNote = note;
    } else {
      midiNote = 48; // C-3 default
    }

    this.engine.sendMessage({
      type: 'noteOn',
      handle: this._playerHandle,
      note: midiNote,
      velocity: 127,
    });
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed || this._playerHandle < 0) return;
    this.engine.sendMessage({
      type: 'noteOff',
      handle: this._playerHandle,
    });
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
    switch (param) {
      case 'volume':
        return this.output.gain.value;
    }
    return undefined;
  }

  getEngine(): OctaMEDEngine {
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
      OctaMEDSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }

  private noteNameToMidi(name: string): number {
    const noteMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
    };
    const m = name.match(/^([A-G][#b]?)(-?\d+)$/);
    if (!m) return 48;
    const pc = noteMap[m[1]] ?? 0;
    const oct = parseInt(m[2], 10);
    return (oct + 1) * 12 + pc;
  }
}
