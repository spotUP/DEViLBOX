/**
 * SoundMonSynth.ts — DevilboxSynth wrapper for SoundMon II WASM engine
 *
 * Implements per-note triggering for SoundMon instruments.
 * Each SoundMonSynth instance owns one sm_create_player() handle.
 *
 * Binary serialisation format for sm_load_instrument() matches soundmon_synth.c:
 *   [0]       type (0=synth, 1=pcm)
 *   --- SYNTH ---
 *   [1]       waveType
 *   [2]       waveSpeed (reserved)
 *   [3]       arpSpeed
 *   [4..7]    attackVol, decayVol, sustainVol, releaseVol
 *   [8..11]   attackSpeed, decaySpeed, sustainLen, releaseSpeed
 *   [12..15]  vibratoDelay, vibratoSpeed, vibratoDepth, portamentoSpeed
 *   [16..31]  arpTable[16] (signed bytes)
 *   [32..35]  waveDataLen (uint32 LE)
 *   [36..]    waveData (optional custom waveform)
 *   --- PCM ---
 *   [1]       volume, [2] finetune, [3] transpose
 *   [4..7]    pcmLen, [8..11] loopStart, [12..15] loopLen
 *   [16..]    pcmData
 */

import type { DevilboxSynth } from '@/types/synth';
import type { SoundMonConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SoundMonEngine } from './SoundMonEngine';

export class SoundMonSynth implements DevilboxSynth {
  readonly name = 'SoundMonSynth';
  readonly output: GainNode;

  private engine: SoundMonEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    this.engine = SoundMonEngine.getInstance();

    if (!SoundMonSynth._engineConnectedToSynth) {
      this.engine.output.connect(this.output);
      SoundMonSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: SoundMonConfig): Promise<void> {
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
    const blob = serializeSoundMonConfig(config);
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
            paramId: 6,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
      case 'vibratoSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 5,
            value: Math.max(0, Math.min(1, value / 63)),
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

  getEngine(): SoundMonEngine {
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
      SoundMonSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a SoundMonConfig into the binary format expected by sm_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 */
function serializeSoundMonConfig(cfg: SoundMonConfig): ArrayBuffer {
  if (cfg.type === 'pcm') {
    const pcm = cfg.pcmData ?? new Uint8Array(0);
    const totalLen = 16 + pcm.length;
    const buf = new Uint8Array(totalLen);
    buf[0] = 1; // type=PCM
    buf[1] = (cfg.volume ?? 64) & 0xFF;
    buf[2] = ((cfg.finetune ?? 0) + 256) & 0xFF; // signed → unsigned
    buf[3] = ((cfg.transpose ?? 0) + 256) & 0xFF;
    // pcmLen LE uint32
    const len = pcm.length;
    buf[4] = len & 0xFF; buf[5] = (len >> 8) & 0xFF;
    buf[6] = (len >> 16) & 0xFF; buf[7] = (len >> 24) & 0xFF;
    // loopStart LE uint32
    const ls = cfg.loopStart ?? 0;
    buf[8] = ls & 0xFF; buf[9] = (ls >> 8) & 0xFF;
    buf[10] = (ls >> 16) & 0xFF; buf[11] = (ls >> 24) & 0xFF;
    // loopLength LE uint32
    const ll = cfg.loopLength ?? 0;
    buf[12] = ll & 0xFF; buf[13] = (ll >> 8) & 0xFF;
    buf[14] = (ll >> 16) & 0xFF; buf[15] = (ll >> 24) & 0xFF;
    buf.set(pcm, 16);
    return buf.buffer;
  }

  // Synth instrument — optionally include custom waveform
  // (no custom waveform for now; C module uses built-in from waveType)
  const waveDataLen = 0;
  const totalLen = 36 + waveDataLen;
  const buf = new Uint8Array(totalLen);

  buf[0]  = 0; // type=synth
  buf[1]  = (cfg.waveType ?? 0) & 0x0F;
  buf[2]  = (cfg.waveSpeed ?? 0) & 0x0F;
  buf[3]  = (cfg.arpSpeed ?? 0) & 0x0F;
  buf[4]  = (cfg.attackVolume ?? 64) & 0xFF;
  buf[5]  = (cfg.decayVolume ?? 32) & 0xFF;
  buf[6]  = (cfg.sustainVolume ?? 32) & 0xFF;
  buf[7]  = (cfg.releaseVolume ?? 0) & 0xFF;
  buf[8]  = (cfg.attackSpeed ?? 4) & 0xFF;
  buf[9]  = (cfg.decaySpeed ?? 4) & 0xFF;
  buf[10] = (cfg.sustainLength ?? 16) & 0xFF;
  buf[11] = (cfg.releaseSpeed ?? 4) & 0xFF;
  buf[12] = (cfg.vibratoDelay ?? 0) & 0xFF;
  buf[13] = (cfg.vibratoSpeed ?? 0) & 0xFF;
  buf[14] = (cfg.vibratoDepth ?? 0) & 0xFF;
  buf[15] = (cfg.portamentoSpeed ?? 0) & 0xFF;

  const arpTable = cfg.arpTable ?? new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    buf[16 + i] = (arpTable[i] ?? 0) & 0xFF; // cast signed to byte
  }

  // waveDataLen = 0 (LE uint32)
  buf[32] = 0; buf[33] = 0; buf[34] = 0; buf[35] = 0;

  return buf.buffer;
}
