/**
 * TFMXSynth.ts — DevilboxSynth wrapper for TFMX WASM engine
 *
 * Implements per-note triggering for TFMX instruments.
 * Each TFMXSynth instance owns one tfmx_create_player() handle.
 *
 * Binary serialisation format for tfmx_load_instrument() matches tfmx_synth.cpp:
 *   [0..3]:   sndSeqsCount  u32LE
 *   [4..7]:   sampleCount   u32LE
 *   [8..11]:  sampleDataLen u32LE
 *   [12 .. +64*sndSeqsCount-1]:   sndModSeqData  (all SndModSeqs)
 *   [+64]:                         volModSeqData  (this instrument's VolModSeq)
 *   [+30*sampleCount]:             sampleHeaders
 *   [..]:                          sampleData
 */

import type { DevilboxSynth } from '@/types/synth';
import type { TFMXConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { TFMXEngine } from './TFMXEngine';

export class TFMXSynth implements DevilboxSynth {
  readonly name = 'TFMXSynth';
  readonly output: GainNode;

  private engine: TFMXEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = TFMXEngine.getInstance();

    if (!TFMXSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      TFMXSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: TFMXConfig): Promise<void> {
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
    const blob = serializeTFMXConfig(config);
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

  getEngine(): TFMXEngine {
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
      TFMXSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a TFMXConfig into the binary blob expected by tfmx_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 *
 * Layout:
 *   [0..3]:   sndSeqsCount  u32LE
 *   [4..7]:   sampleCount   u32LE
 *   [8..11]:  sampleDataLen u32LE
 *   [12 ..]:  sndModSeqData (64 * sndSeqsCount)
 *   [+64]:    volModSeqData (64 bytes)
 *   [+30*N]:  sampleHeaders
 *   [..]:     sampleData
 */
export function serializeTFMXConfig(cfg: TFMXConfig): ArrayBuffer {
  const sndSeqsCount  = cfg.sndSeqsCount;
  const sampleCount   = cfg.sampleCount;
  const sndSeqData    = cfg.sndModSeqData ?? new Uint8Array(0);
  const volSeqData    = cfg.volModSeqData ?? new Uint8Array(64);
  const smpHdrs       = cfg.sampleHeaders ?? new Uint8Array(0);
  const smpData       = cfg.sampleData    ?? new Uint8Array(0);
  const sampleDataLen = smpData.length;

  const totalLen = 12
    + sndSeqData.length
    + 64 // volModSeqData
    + smpHdrs.length
    + sampleDataLen;

  const buf = new Uint8Array(totalLen);
  let off = 0;

  // sndSeqsCount u32LE
  buf[off++] = sndSeqsCount & 0xFF;
  buf[off++] = (sndSeqsCount >> 8) & 0xFF;
  buf[off++] = (sndSeqsCount >> 16) & 0xFF;
  buf[off++] = (sndSeqsCount >> 24) & 0xFF;
  // sampleCount u32LE
  buf[off++] = sampleCount & 0xFF;
  buf[off++] = (sampleCount >> 8) & 0xFF;
  buf[off++] = (sampleCount >> 16) & 0xFF;
  buf[off++] = (sampleCount >> 24) & 0xFF;
  // sampleDataLen u32LE
  buf[off++] = sampleDataLen & 0xFF;
  buf[off++] = (sampleDataLen >> 8) & 0xFF;
  buf[off++] = (sampleDataLen >> 16) & 0xFF;
  buf[off++] = (sampleDataLen >> 24) & 0xFF;

  // SndModSeqData
  buf.set(sndSeqData, off);
  off += sndSeqData.length;

  // VolModSeqData (pad to 64 bytes if shorter)
  const volSlice = volSeqData.subarray(0, Math.min(64, volSeqData.length));
  buf.set(volSlice, off);
  off += 64;

  // SampleHeaders
  buf.set(smpHdrs, off);
  off += smpHdrs.length;

  // SampleData
  buf.set(smpData, off);

  return buf.buffer;
}
