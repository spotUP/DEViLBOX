/**
 * DigMugSynth.ts — DevilboxSynth wrapper for Digital Mugician WASM engine
 *
 * Implements per-note triggering for Digital Mugician instruments.
 * Each DigMugSynth instance owns one dm_create_player() handle.
 *
 * Binary serialisation format for dm_load_instrument() matches digmug_synth.c:
 *
 * WAVETABLE (type=0):
 *   [0]       type (0)
 *   [1..4]    wave[0..3] indices (reference only)
 *   [5]       waveBlend (0-63)
 *   [6]       waveSpeed (0-63)
 *   [7]       volume (0-64)
 *   [8]       arpSpeed (0-15)
 *   [9..16]   arpTable[8] (signed bytes)
 *   [17]      vibSpeed (0-63)
 *   [18]      vibDepth (0-63)
 *   [19]      reserved (0)
 *   [20..23]  waveDataLen (uint32 LE)
 *   [24..]    waveData (signed int8, 0-128 bytes)
 *
 * PCM (type=1):
 *   [0]       type (1)
 *   [1]       volume (0-64)
 *   [2]       arpSpeed (0-15)
 *   [3..10]   arpTable[8] (signed bytes)
 *   [11]      vibSpeed (0-63)
 *   [12]      vibDepth (0-63)
 *   [13..16]  pcmLen (uint32 LE)
 *   [17..20]  loopStart (uint32 LE)
 *   [21..24]  loopLength (uint32 LE, 0=no loop)
 *   [25..]    pcmData (signed int8)
 */

import type { DevilboxSynth } from '@/types/synth';
import type { DigMugConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { DigMugEngine } from './DigMugEngine';

export class DigMugSynth implements DevilboxSynth {
  readonly name = 'DigMugSynth';
  readonly output: GainNode;

  private engine: DigMugEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = DigMugEngine.getInstance();

    if (!DigMugSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      DigMugSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: DigMugConfig): Promise<void> {
    await this.engine.ready();

    if (this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    this.engine.sendMessage({ type: 'createPlayer' });
    this._playerHandle = await this.engine.waitForPlayerHandle();

    const blob = serializeDigMugConfig(config);
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
      case 'vibSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 5,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
      case 'vibDepth':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 6,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
      case 'arpSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 8,
            value: Math.max(0, Math.min(1, value / 15)),
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

  getEngine(): DigMugEngine {
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
      DigMugSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a DigMugConfig into the binary format expected by dm_load_instrument().
 */
function serializeDigMugConfig(cfg: DigMugConfig): ArrayBuffer {
  if (cfg.pcmData && cfg.pcmData.length > 0) {
    // PCM instrument (type=1)
    const pcm = cfg.pcmData;
    const totalLen = 25 + pcm.length;
    const buf = new Uint8Array(totalLen);

    buf[0]  = 1; // type=pcm
    buf[1]  = (cfg.volume ?? 64) & 0x3F;
    buf[2]  = (cfg.arpSpeed ?? 0) & 0xF;

    const arpTable = cfg.arpTable ?? new Array(8).fill(0);
    for (let i = 0; i < 8; i++) {
      buf[3 + i] = (arpTable[i] ?? 0) & 0xFF;
    }

    buf[11] = (cfg.vibSpeed ?? 0) & 0x3F;
    buf[12] = (cfg.vibDepth ?? 0) & 0x3F;

    const len = pcm.length;
    buf[13] = len & 0xFF;           buf[14] = (len >> 8) & 0xFF;
    buf[15] = (len >> 16) & 0xFF;   buf[16] = (len >> 24) & 0xFF;

    const ls = cfg.loopStart ?? 0;
    buf[17] = ls & 0xFF;            buf[18] = (ls >> 8) & 0xFF;
    buf[19] = (ls >> 16) & 0xFF;    buf[20] = (ls >> 24) & 0xFF;

    const ll = cfg.loopLength ?? 0;
    buf[21] = ll & 0xFF;            buf[22] = (ll >> 8) & 0xFF;
    buf[23] = (ll >> 16) & 0xFF;    buf[24] = (ll >> 24) & 0xFF;

    buf.set(pcm, 25);
    return buf.buffer;
  }

  // Wavetable instrument (type=0)
  const waveData = cfg.waveformData ?? new Uint8Array(0);
  const totalLen = 24 + waveData.length;
  const buf = new Uint8Array(totalLen);

  buf[0]  = 0; // type=wavetable
  const wt = cfg.wavetable ?? [0, 0, 0, 0];
  buf[1]  = wt[0] & 0xFF;
  buf[2]  = wt[1] & 0xFF;
  buf[3]  = wt[2] & 0xFF;
  buf[4]  = wt[3] & 0xFF;
  buf[5]  = (cfg.waveBlend ?? 0) & 0x3F;
  buf[6]  = (cfg.waveSpeed ?? 0) & 0x3F;
  buf[7]  = Math.min(64, cfg.volume ?? 64) & 0xFF;
  buf[8]  = (cfg.arpSpeed ?? 0) & 0xF;

  const arpTable = cfg.arpTable ?? new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    buf[9 + i] = (arpTable[i] ?? 0) & 0xFF;
  }

  buf[17] = (cfg.vibSpeed ?? 0) & 0x3F;
  buf[18] = (cfg.vibDepth ?? 0) & 0x3F;
  buf[19] = 0; // reserved

  const wdLen = waveData.length;
  buf[20] = wdLen & 0xFF;           buf[21] = (wdLen >> 8) & 0xFF;
  buf[22] = (wdLen >> 16) & 0xFF;   buf[23] = (wdLen >> 24) & 0xFF;

  if (wdLen > 0) {
    buf.set(waveData, 24);
  }

  return buf.buffer;
}
