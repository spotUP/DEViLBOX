/**
 * HippelCoSoSynth.ts — DevilboxSynth wrapper for Jochen Hippel CoSo WASM engine
 *
 * Implements per-note triggering for Jochen Hippel CoSo instruments.
 * Each HippelCoSoSynth instance owns one hc_create_player() handle.
 *
 * Binary serialisation format for hc_load_instrument() matches hippel_coso_synth.c:
 *   [0]       version byte (0)
 *   [1]       volSpeed (ticks per vseq step)
 *   [2]       vibSpeed (signed byte)
 *   [3]       vibDepth
 *   [4]       vibDelay
 *   [5..6]    fseqLen (uint16 LE)
 *   [7..N]    fseq data (signed bytes)
 *   [N+1..N+2] vseqLen (uint16 LE)
 *   [N+3..]   vseq data (signed bytes)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { HippelCoSoConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { HippelCoSoEngine } from './HippelCoSoEngine';

export class HippelCoSoSynth implements DevilboxSynth {
  readonly name = 'HippelCoSoSynth';
  readonly output: GainNode;

  private engine: HippelCoSoEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = HippelCoSoEngine.getInstance();

    if (!HippelCoSoSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      HippelCoSoSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async ensureInitialized(): Promise<void> {
    await this.engine.ready();
  }

  async setInstrument(config: HippelCoSoConfig): Promise<void> {
    await this.engine.ready();

    // Destroy old player if we have one
    if (this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    // Create a new player
    this.engine.sendMessage({ type: 'createPlayer' });
    this._playerHandle = await this.engine.waitForPlayerHandle();

    if (this._playerHandle < 0) return; // Pool full — no player allocated

    // Serialize and upload instrument
    const blob = serializeHippelCoSoConfig(config);
    this.engine.sendMessage(
      { type: 'loadInstrument', handle: this._playerHandle, buffer: blob },
      [blob],
    );
  }

  /** Re-upload instrument config to running WASM synth (for live parameter editing) */
  updateConfig(config: HippelCoSoConfig): void {
    if (this._disposed || this._playerHandle < 0) return;
    const blob = serializeHippelCoSoConfig(config);
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
      case 'vibDepth':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 1,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'vibSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 2,
            value: Math.max(0, Math.min(1, value / 127)),
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

  getEngine(): HippelCoSoEngine {
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
      HippelCoSoSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a HippelCoSoConfig into the binary format expected by hc_load_instrument()
 * (hippel_coso_synth.cpp, version 2): the volume sequence header bytes, the sound
 * (fseq) and volume (vseq) sequences, and the samples the sound sequence switches
 * to with their PCM, from which the voice assembles a COSO module the decoder plays.
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 */
export function serializeHippelCoSoConfig(cfg: HippelCoSoConfig): ArrayBuffer {
  const fseq = cfg.fseq ?? [];
  const vseq = cfg.vseq ?? [];
  const samples = cfg.samples ?? [];

  const total = 11 + fseq.length + vseq.length + samples.reduce((n, smp) => n + 12 + smp.pcm.length, 0);
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);

  buf[0] = 2; // version
  buf[1] = Math.max(1, cfg.volSpeed ?? 1) & 0xFF;
  buf[2] = (cfg.vibSpeed ?? 0) & 0xFF;   // signed -> the byte the player reads
  buf[3] = (cfg.vibDepth ?? 0) & 0xFF;
  buf[4] = (cfg.vibDelay ?? 0) & 0xFF;
  dv.setUint16(5, fseq.length, true);
  dv.setUint16(7, vseq.length, true);
  dv.setUint16(9, samples.length, true);

  let pos = 11;
  for (const b of fseq) buf[pos++] = b & 0xFF;
  for (const b of vseq) buf[pos++] = b & 0xFF;
  for (const smp of samples) {
    dv.setUint16(pos, smp.index, true);
    dv.setUint16(pos + 2, smp.length >> 1, true);        // header words are in words
    dv.setUint16(pos + 4, smp.loopStart, true);
    dv.setUint16(pos + 6, smp.repeatLength >> 1, true);
    dv.setUint32(pos + 8, smp.pcm.length, true);
    pos += 12;
    for (const b of smp.pcm) buf[pos++] = b & 0xFF;
  }
  return buf.buffer;
}
