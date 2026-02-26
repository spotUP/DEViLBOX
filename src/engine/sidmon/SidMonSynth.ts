/**
 * SidMonSynth.ts — DevilboxSynth wrapper for SidMon II WASM engine
 *
 * Implements per-note triggering for SidMon II instruments.
 * Each SidMonSynth instance owns one smn_create_player() handle.
 *
 * Binary serialisation format for smn_load_instrument() matches sidmon_synth.c:
 *   [0]       type (0=synth, 1=pcm)
 *   --- SYNTH ---
 *   [1]       waveform (0=triangle, 1=sawtooth, 2=pulse, 3=noise)
 *   [2]       pulseWidth (0-255)
 *   [3]       attack (0-15 SID rate index)
 *   [4]       decay  (0-15 SID rate index)
 *   [5]       sustain (0-15 level)
 *   [6]       release (0-15 SID rate index)
 *   [7]       arpSpeed (0-15)
 *   [8..15]   arpTable[8] (signed bytes)
 *   [16]      vibDelay (0-255)
 *   [17]      vibSpeed (0-63)
 *   [18]      vibDepth (0-63)
 *   [19]      filterCutoff (0-255)
 *   [20]      filterResonance (0-15)
 *   [21]      filterMode (0=LP, 1=HP, 2=BP)
 *   --- PCM ---
 *   [1]       attack, [2] decay, [3] sustain, [4] release (all 0-15)
 *   [5]       arpSpeed, [6..13] arpTable[8]
 *   [14]      vibDelay, [15] vibSpeed, [16] vibDepth
 *   [17]      finetune (signed byte)
 *   [18..21]  pcmLen (uint32 LE)
 *   [22..25]  loopStart (uint32 LE)
 *   [26..29]  loopLength (uint32 LE)
 *   [30..]    pcmData
 */

import type { DevilboxSynth } from '@/types/synth';
import type { SidMonConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SidMonEngine } from './SidMonEngine';

export class SidMonSynth implements DevilboxSynth {
  readonly name = 'SidMonSynth';
  readonly output: GainNode;

  private engine: SidMonEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = SidMonEngine.getInstance();

    if (!SidMonSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      SidMonSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: SidMonConfig): Promise<void> {
    await this.engine.ready();

    if (this._playerHandle >= 0) {
      this.engine.sendMessage({ type: 'destroyPlayer', handle: this._playerHandle });
      this._playerHandle = -1;
    }

    this.engine.sendMessage({ type: 'createPlayer' });
    this._playerHandle = await this.engine.waitForPlayerHandle();

    const blob = serializeSidMonConfig(config);
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
            paramId: 6,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
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
      case 'filterCutoff':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 16,
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

  getEngine(): SidMonEngine {
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
      SidMonSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a SidMonConfig into the binary format expected by smn_load_instrument().
 */
function serializeSidMonConfig(cfg: SidMonConfig): ArrayBuffer {
  if (cfg.type === 'pcm') {
    const pcm = cfg.pcmData ?? new Uint8Array(0);
    const totalLen = 30 + pcm.length;
    const buf = new Uint8Array(totalLen);

    buf[0]  = 1; // type=PCM
    buf[1]  = (cfg.attack  ?? 2) & 0xF;
    buf[2]  = (cfg.decay   ?? 4) & 0xF;
    buf[3]  = (cfg.sustain ?? 8) & 0xF;
    buf[4]  = (cfg.release ?? 4) & 0xF;
    buf[5]  = (cfg.arpSpeed ?? 0) & 0xF;

    const arpTable = cfg.arpTable ?? new Array(8).fill(0);
    for (let i = 0; i < 8; i++) {
      buf[6 + i] = (arpTable[i] ?? 0) & 0xFF;
    }

    buf[14] = (cfg.vibDelay ?? 0) & 0xFF;
    buf[15] = (cfg.vibSpeed ?? 0) & 0x3F;
    buf[16] = (cfg.vibDepth ?? 0) & 0x3F;
    buf[17] = ((cfg.finetune ?? 0) + 256) & 0xFF;

    const len = pcm.length;
    buf[18] = len & 0xFF;          buf[19] = (len >> 8) & 0xFF;
    buf[20] = (len >> 16) & 0xFF;  buf[21] = (len >> 24) & 0xFF;

    const ls = cfg.loopStart ?? 0;
    buf[22] = ls & 0xFF;           buf[23] = (ls >> 8) & 0xFF;
    buf[24] = (ls >> 16) & 0xFF;   buf[25] = (ls >> 24) & 0xFF;

    const ll = cfg.loopLength ?? 0;
    buf[26] = ll & 0xFF;           buf[27] = (ll >> 8) & 0xFF;
    buf[28] = (ll >> 16) & 0xFF;   buf[29] = (ll >> 24) & 0xFF;

    buf.set(pcm, 30);
    return buf.buffer;
  }

  // Synth instrument
  const buf = new Uint8Array(22);

  buf[0]  = 0; // type=synth
  buf[1]  = (cfg.waveform   ?? 1)   & 0x3;
  buf[2]  = (cfg.pulseWidth ?? 128) & 0xFF;
  buf[3]  = (cfg.attack     ?? 2)   & 0xF;
  buf[4]  = (cfg.decay      ?? 4)   & 0xF;
  buf[5]  = (cfg.sustain    ?? 8)   & 0xF;
  buf[6]  = (cfg.release    ?? 4)   & 0xF;
  buf[7]  = (cfg.arpSpeed   ?? 0)   & 0xF;

  const arpTable = cfg.arpTable ?? new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    buf[8 + i] = (arpTable[i] ?? 0) & 0xFF;
  }

  buf[16] = (cfg.vibDelay      ?? 0)   & 0xFF;
  buf[17] = (cfg.vibSpeed      ?? 0)   & 0x3F;
  buf[18] = (cfg.vibDepth      ?? 0)   & 0x3F;
  buf[19] = (cfg.filterCutoff  ?? 255) & 0xFF;
  buf[20] = (cfg.filterResonance ?? 0) & 0xF;
  buf[21] = (cfg.filterMode    ?? 0)   & 0x3;

  return buf.buffer;
}
