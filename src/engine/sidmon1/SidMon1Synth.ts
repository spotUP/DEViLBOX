/**
 * SidMon1Synth.ts — DevilboxSynth wrapper for SidMon 1.0 WASM engine
 *
 * Implements per-note triggering for SidMon 1.0 instruments.
 * Each SidMon1Synth instance owns one sm1_create_player() handle.
 *
 * The blob sm1_load_instrument() reads is documented at serializeSidMon1Config
 * and in sidmon1-wasm/src/sidmon1_synth.c.
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

  async ensureInitialized(): Promise<void> {
    await this.engine.ready();
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

    if (this._playerHandle < 0) return; // Pool full — no player allocated

    // Serialize and upload instrument
    const blob = serializeSidMon1Config(config);
    this.engine.sendMessage(
      { type: 'loadInstrument', handle: this._playerHandle, buffer: blob },
      [blob],
    );
  }

  /** Re-upload instrument config to running WASM synth (for live parameter editing) */
  updateConfig(config: SidMon1Config): void {
    if (this._disposed || this._playerHandle < 0) return;
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
      case 'attackSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 3,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'decaySpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 4,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'releaseSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 5,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'releaseMin':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 6,
            value: Math.max(0, Math.min(1, value / 64)),
          });
        }
        break;
      case 'sustain':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 7,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'phaseShift':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 8,
            value: Math.max(0, Math.min(1, value / 255)),
          });
        }
        break;
      case 'phaseSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 9,
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
 * Serialise a SidMon1Config into the blob sm1_load_instrument() reads (layout
 * in sidmon1_synth.c): the replayer's instrument record, its wave list and the
 * waves and PCM sample it plays. Wave edits made in the editor (mainWave at the
 * instrument's waveform, phaseWave at its phase shift) replace the imported waves.
 */
export function serializeSidMon1Config(cfg: SidMon1Config): ArrayBuffer {
  const waveform = cfg.waveform ?? 0;
  const phaseShift = cfg.phaseShift ?? 0;
  const waveList = cfg.waveList ?? [waveform, 0xff, 0xff, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const waves = new Map<number, number[]>();
  Object.entries(cfg.waves ?? {}).forEach(([k, v]) => waves.set(Number(k), v));
  if (waveform <= 15 && cfg.mainWave) waves.set(waveform, cfg.mainWave);
  if (phaseShift > 0 && cfg.phaseWave) waves.set(phaseShift, cfg.phaseWave);
  const pcm = cfg.pcm && waveform > 15 ? cfg.pcm : undefined;

  const mixes = (cfg.mix ?? []).slice(0, 2);
  mixes.forEach((m) => [m.src1, m.src2].forEach((w) => { const src = cfg.waves?.[w]; if (src && !waves.has(w)) waves.set(w, src); }));
  const buf = new Uint8Array(50 + waves.size * 33 + 12 + (pcm ? pcm.data.length : 0) + 8);
  const view = new DataView(buf.buffer);
  buf[0] = 2;
  view.setUint32(1, waveform, true);
  const arp = cfg.arpeggio ?? [];
  for (let i = 0; i < 16; i++) buf[5 + i] = (arp[i] ?? 0) & 0xFF;
  buf[21] = (cfg.attackSpeed ?? 8) & 0xFF;
  buf[22] = (cfg.attackMax ?? 64) & 0xFF;
  buf[23] = (cfg.decaySpeed ?? 4) & 0xFF;
  buf[24] = (cfg.decayMin ?? 32) & 0xFF;
  buf[25] = (cfg.sustain ?? 0) & 0xFF;
  buf[26] = (cfg.releaseSpeed ?? 4) & 0xFF;
  buf[27] = (cfg.releaseMin ?? 0) & 0xFF;
  buf[28] = phaseShift & 0xFF;
  buf[29] = (cfg.phaseSpeed ?? 0) & 0xFF;
  view.setUint16(30, Math.max(0, Math.min(1005, cfg.finetune ?? 0)), true);
  buf[32] = (cfg.pitchFall ?? 0) & 0xFF;
  for (let i = 0; i < 16; i++) buf[33 + i] = (waveList[i] ?? 0) & 0xFF;
  buf[49] = waves.size;
  let at = 50;
  waves.forEach((w, idx) => {
    buf[at] = idx & 0xFF;
    for (let i = 0; i < 32; i++) buf[at + 1 + i] = (w[i] ?? 0) & 0xFF;
    at += 33;
  });
  view.setUint32(at, pcm ? pcm.data.length : 0, true);
  view.setUint32(at + 4, pcm ? pcm.loop : 0, true);
  view.setUint32(at + 8, pcm ? pcm.repeat : 0, true);
  at += 12;
  if (pcm) { pcm.data.forEach((v, i) => { buf[at + i] = v & 0xFF; }); at += pcm.data.length; }
  mixes.forEach((m, k) => { buf[at + k * 4] = m.speed; buf[at + k * 4 + 1] = m.dest; buf[at + k * 4 + 2] = m.src1; buf[at + k * 4 + 3] = m.src2; });
  return buf.buffer;
}
