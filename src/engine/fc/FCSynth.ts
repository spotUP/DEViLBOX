/**
 * FCSynth.ts — DevilboxSynth wrapper for Future Composer WASM engine
 *
 * Implements per-note triggering for Future Composer instruments.
 * Each FCSynth instance owns one fc_create_player() handle.
 *
 * Binary serialisation format for fc_load_instrument() matches fc_synth.c:
 *   [0]          type: 0=FC synth, 1=PCM sample
 *   --- FC SYNTH (type=0) ---
 *   [1]          initialWaveNum (0-46)
 *   [2]          synthSpeed (1-15)
 *   [3..50]      synthTable[16][3]: waveNum(1), transpositionSigned(1), effect(1)
 *   [51]         atkLength (0-255)
 *   [52]         atkVolume (0-64)
 *   [53]         decLength (0-255)
 *   [54]         decVolume (0-64)
 *   [55]         sustVolume (0-64)
 *   [56]         relLength (0-255)
 *   [57]         vibDelay (0-255)
 *   [58]         vibSpeed (0-63)
 *   [59]         vibDepth (0-63)
 *   [60..75]     arpTable[16] (signed bytes)
 *   --- PCM (type=1) ---
 *   [1]          volume (0-64)
 *   [2]          finetune (signed int8 as uint8: finetune+128)
 *   [3..6]       pcmLen uint32 LE
 *   [7..10]      loopStart uint32 LE
 *   [11..14]     loopLen uint32 LE
 *   [15..]       pcmData
 */

import type { DevilboxSynth } from '@/types/synth';
import type { FCConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { FCEngine } from './FCEngine';

export class FCSynth implements DevilboxSynth {
  readonly name = 'FCSynth';
  readonly output: GainNode;

  private engine: FCEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;
  private _config: FCConfig | null = null;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = FCEngine.getInstance();

    if (!FCSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      FCSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: FCConfig): Promise<void> {
    this._config = config;

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
    const blob = serializeFCConfig(config);
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
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
      case 'vibSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 2,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
    }
  }

  get(param: string): number | undefined {
    if (param === 'volume') return this.output.gain.value;
    return undefined;
  }

  getEngine(): FCEngine {
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
      FCSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise an FCConfig into the binary format expected by fc_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 *
 * FC Synth blob layout (76 bytes total):
 *   [0]        type=0
 *   [1]        initialWaveNum (0-46)
 *   [2]        synthSpeed (1-15)
 *   [3..50]    synthTable[16][3]: waveNum, transpositionSigned, effect
 *   [51..56]   ADSR lengths/volumes: atkLength, atkVolume, decLength, decVolume, sustVolume, relLength
 *   [57..59]   vibDelay, vibSpeed, vibDepth
 *   [60..75]   arpTable[16] signed bytes
 */
export function serializeFCConfig(cfg: FCConfig): ArrayBuffer {
  const buf = new Uint8Array(76);

  buf[0] = 0; // type=FC synth
  buf[1] = Math.max(0, Math.min(46, cfg.waveNumber ?? 0));
  buf[2] = Math.max(1, Math.min(15, cfg.synthSpeed ?? 1));

  // synthTable: 16 entries × 3 bytes
  const table = cfg.synthTable ?? [];
  for (let i = 0; i < 16; i++) {
    const step = table[i];
    const base = 3 + i * 3;
    if (step) {
      buf[base]     = Math.max(0, Math.min(46, step.waveNum ?? 0)) & 0xFF;
      buf[base + 1] = ((step.transposition ?? 0) & 0xFF); // signed → unsigned
      buf[base + 2] = (step.effect ?? 0) & 0xFF;
    }
    // else zero-filled by default
  }

  buf[51] = Math.max(0, Math.min(255, cfg.atkLength ?? 4));
  buf[52] = Math.max(0, Math.min(64, cfg.atkVolume ?? 64));
  buf[53] = Math.max(0, Math.min(255, cfg.decLength ?? 8));
  buf[54] = Math.max(0, Math.min(64, cfg.decVolume ?? 32));
  buf[55] = Math.max(0, Math.min(64, cfg.sustVolume ?? 32));
  buf[56] = Math.max(0, Math.min(255, cfg.relLength ?? 8));
  buf[57] = Math.max(0, Math.min(255, cfg.vibDelay ?? 0));
  buf[58] = Math.max(0, Math.min(63, cfg.vibSpeed ?? 0));
  buf[59] = Math.max(0, Math.min(63, cfg.vibDepth ?? 0));

  const arpTable = cfg.arpTable ?? new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    buf[60 + i] = (arpTable[i] ?? 0) & 0xFF; // signed → unsigned byte
  }

  return buf.buffer;
}

/**
 * Serialise a PCM instrument (FC PCM sample slot) for fc_load_instrument().
 */
export function serializeFCPcm(
  pcmData: Uint8Array,
  volume: number,
  loopStart: number,
  loopLen: number,
  finetune = 0,
): ArrayBuffer {
  const totalLen = 15 + pcmData.length;
  const buf = new Uint8Array(totalLen);

  buf[0] = 1; // type=PCM
  buf[1] = Math.max(0, Math.min(64, volume)) & 0xFF;
  buf[2] = ((finetune + 128) & 0xFF); // signed → unsigned

  const len = pcmData.length;
  buf[3] = len & 0xFF; buf[4] = (len >> 8) & 0xFF;
  buf[5] = (len >> 16) & 0xFF; buf[6] = (len >> 24) & 0xFF;

  const ls = loopStart;
  buf[7] = ls & 0xFF; buf[8] = (ls >> 8) & 0xFF;
  buf[9] = (ls >> 16) & 0xFF; buf[10] = (ls >> 24) & 0xFF;

  const ll = loopLen;
  buf[11] = ll & 0xFF; buf[12] = (ll >> 8) & 0xFF;
  buf[13] = (ll >> 16) & 0xFF; buf[14] = (ll >> 24) & 0xFF;

  buf.set(pcmData, 15);
  return buf.buffer;
}
