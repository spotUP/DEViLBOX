/**
 * FCSynth.ts - DevilboxSynth wrapper for the Future Composer keyboard preview voice.
 * Each FCSynth instance owns one fc_create_player() handle; the blob layout is
 * documented at serializeFCConfig and in fc-wasm/src/fc_synth.c.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { FCConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { FCEngine } from './FCEngine';
import { encodeFCFreqMacro, encodeFCVolEnvelope } from '@/engine/uade/chipRamEncoders';
import { extractFC13Wave, fcMacroReach } from '@/lib/import/formats/FCParser';

export class FCSynth implements DevilboxSynth {
  readonly name = 'FCSynth';
  readonly output: GainNode;

  private engine: FCEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;

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

  async ensureInitialized(): Promise<void> {
    await this.engine.ready();
  }

  async setInstrument(config: FCConfig): Promise<void> {
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
    const blob = serializeFCConfig(config);
    this.engine.sendMessage(
      { type: 'loadInstrument', handle: this._playerHandle, buffer: blob },
      [blob],
    );
  }

  /** Re-upload instrument config to running WASM synth (for live parameter editing) */
  updateConfig(config: FCConfig): void {
    if (this._disposed || this._playerHandle < 0) return;
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
      case 'vibDelay':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 3,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'synthSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 4,
            value: Math.max(0, Math.min(1, value / 15)),
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
 * Serialise an FCConfig into the blob fc_load_instrument() reads: the
 * replayer's own instrument, i.e. the 64-byte volume macro, the frequency
 * macros it reaches and the waves those select (layout in fc_synth.c).
 *
 * Volume macro: header from the config (speed, vibrato), values from the
 * imported macro bytes, or the editor's ADSR encoded the way it is written to
 * chip RAM. Frequency macro: the imported bytes, or the editor's synth table
 * and arpeggio encoded the way it is written to chip RAM.
 */
export function serializeFCConfig(cfg: FCConfig): ArrayBuffer {
  const vol = new Uint8Array(64).fill(0xE1);
  vol[0] = cfg.volMacroSpeed ?? Math.max(1, cfg.synthSpeed ?? 1);
  vol[1] = cfg.freqMacroIndex ?? 0;
  vol[2] = cfg.vibSpeed ?? 0;
  vol[3] = cfg.vibDepth ?? 0;
  vol[4] = cfg.vibDelay ?? 0;
  const values = cfg.volMacroData && cfg.volMacroData.length > 0
    ? cfg.volMacroData.slice(0, 59)
    : Array.from(encodeFCVolEnvelope(cfg));
  for (let i = 0; i < values.length; i++) vol[5 + i] = values[i] & 0xFF;

  const entry = cfg.freqMacroIndex ?? 0;
  const macros = new Map<number, Uint8Array>();
  if (cfg.freqMacros && cfg.freqMacros[entry]) {
    for (const [k, v] of Object.entries(cfg.freqMacros)) macros.set(Number(k), Uint8Array.from(v));
  } else {
    const table = cfg.synthTable && cfg.synthTable.length > 0
      ? cfg.synthTable
      : [{ waveNum: cfg.waveNumber ?? 0, transposition: 0, effect: 1 }];
    macros.set(entry, encodeFCFreqMacro(table, cfg.arpTable ?? []));
  }

  const reach = fcMacroReach(entry, (i) => macros.get(i) ?? null);
  const waves: Array<{ idx: number; data: Int8Array; ls: number; ll: number }> = [];
  reach.waves.forEach((w) => {
    const banked = cfg.waveBank?.[w];
    if (banked) {
      waves.push({ idx: w, data: Int8Array.from(banked.data), ls: banked.loopStart, ll: banked.loopLength });
    } else if (w >= 10 && w < 57) {
      const raw = extractFC13Wave(w - 10);
      waves.push({ idx: w, data: Int8Array.from(raw, (v) => (v < 128 ? v : v - 256)), ls: 0, ll: raw.length });
    }
  });

  let size = 67 + macros.size * 65 + 1;
  for (const w of waves) size += 7 + w.data.length;
  const buf = new Uint8Array(size);
  buf[0] = 2;
  buf.set(vol, 1);
  buf[65] = entry;
  buf[66] = macros.size;
  let at = 67;
  macros.forEach((m, idx) => { buf[at] = idx; buf.set(m.subarray(0, 64), at + 1); at += 65; });
  buf[at++] = waves.length;
  for (const w of waves) {
    buf[at] = w.idx;
    buf[at + 1] = w.data.length & 0xFF; buf[at + 2] = (w.data.length >> 8) & 0xFF;
    buf[at + 3] = w.ls & 0xFF; buf[at + 4] = (w.ls >> 8) & 0xFF;
    buf[at + 5] = w.ll & 0xFF; buf[at + 6] = (w.ll >> 8) & 0xFF;
    at += 7;
    buf.set(new Uint8Array(w.data.buffer), at);
    at += w.data.length;
  }
  return buf.buffer;
}
