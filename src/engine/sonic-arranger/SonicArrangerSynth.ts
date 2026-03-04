/**
 * SonicArrangerSynth.ts — DevilboxSynth wrapper for Sonic Arranger WASM engine
 *
 * Implements per-note triggering for Sonic Arranger instruments.
 * Each SonicArrangerSynth instance owns one sa_create_player() handle.
 *
 * Binary serialisation format for sa_load_instrument():
 *
 *   Offset  Size  Field
 *   0       2     volume (uint16 LE)
 *   2       1     fineTuning (int8)
 *   3       2     waveformNumber (uint16 LE)
 *   5       2     waveformLength (uint16 LE)
 *   7       2     portamentoSpeed (uint16 LE)
 *   9       2     vibratoDelay (uint16 LE)
 *   11      2     vibratoSpeed (uint16 LE)
 *   13      2     vibratoLevel (uint16 LE)
 *   15      2     amfNumber (uint16 LE)
 *   17      2     amfDelay (uint16 LE)
 *   19      2     amfLength (uint16 LE)
 *   21      2     amfRepeat (uint16 LE)
 *   23      2     adsrNumber (uint16 LE)
 *   25      2     adsrDelay (uint16 LE)
 *   27      2     adsrLength (uint16 LE)
 *   29      2     adsrRepeat (uint16 LE)
 *   31      2     sustainPoint (uint16 LE)
 *   33      2     sustainDelay (uint16 LE)
 *   35      2     effect (uint16 LE)
 *   37      2     effectArg1 (uint16 LE)
 *   39      2     effectArg2 (uint16 LE)
 *   41      2     effectArg3 (uint16 LE)
 *   43      2     effectDelay (uint16 LE)
 *   --- Arpeggios: 3 x 16 bytes = 48 bytes ---
 *   45      1     arp[0].length (uint8)
 *   46      1     arp[0].repeat (uint8)
 *   47      14    arp[0].values[14] (int8)
 *   61      1     arp[1].length
 *   62      1     arp[1].repeat
 *   63      14    arp[1].values[14]
 *   77      1     arp[2].length
 *   78      1     arp[2].repeat
 *   79      14    arp[2].values[14]
 *   --- Fixed table data ---
 *   93      128   waveformData (int8[128])
 *   221     128   adsrTable (uint8[128])
 *   349     128   amfTable (int8[128])
 *   --- Variable: all waveforms ---
 *   477     2     numWaveforms (uint16 LE)
 *   479     N*128 allWaveforms[N] (int8[128] each)
 */

import type { SonicArrangerConfig } from '@/types/instrument';
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { SonicArrangerEngine } from './SonicArrangerEngine';

export class SonicArrangerSynth implements DevilboxSynth {
  readonly name = 'SonicArrangerSynth';
  readonly output: GainNode;

  private engine: SonicArrangerEngine;
  private audioContext: AudioContext;
  private _disposed = false;
  private _playerHandle = -1;
  private _loadPromise: Promise<void> | null = null;

  private static _engineConnectedToSynth = false;
  private _ownsEngineConnection = false;

  constructor() {
    this.engine = SonicArrangerEngine.getInstance();
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();

    if (!SonicArrangerSynth._engineConnectedToSynth) {
      try {
        this.engine.output.connect(this.output);
      } catch {
        // Context mismatch — recreate engine with current context
        this.engine = SonicArrangerEngine.getInstance();
        this.engine.output.connect(this.output);
      }
      SonicArrangerSynth._engineConnectedToSynth = true;
      this._ownsEngineConnection = true;
    }
  }

  async setInstrument(config: SonicArrangerConfig): Promise<void> {
    const p = this._doSetInstrument(config);
    this._loadPromise = p;
    return p;
  }

  private async _doSetInstrument(config: SonicArrangerConfig): Promise<void> {
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
    const blob = serializeSonicArrangerConfig(config);
    this.engine.sendMessage(
      { type: 'loadInstrument', handle: this._playerHandle, buffer: blob },
      [blob],
    );
  }

  /** Wait for the WASM engine + instrument to be fully loaded. Called by ensureWASMSynthsReady. */
  async ensureInitialized(): Promise<void> {
    await this.engine.ready();
    if (this._loadPromise) await this._loadPromise;
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

  /** Immediate silence — SA 0x7F force quiet (ref: ForceQuiet()) */
  forceQuiet(): void {
    if (this._disposed || this._playerHandle < 0) return;
    this.engine.sendMessage({ type: 'forceQuiet', handle: this._playerHandle });
  }

  /** Re-upload instrument config to running WASM synth (for live parameter editing) */
  updateConfig(config: SonicArrangerConfig): void {
    if (this._disposed || this._playerHandle < 0) return;
    const blob = serializeSonicArrangerConfig(config);
    this.engine.sendMessage(
      { type: 'loadInstrument', handle: this._playerHandle, buffer: blob },
      [blob],
    );
  }

  releaseAll(): void {
    this.triggerRelease();
  }

  set(param: string, value: number): void {
    switch (param) {
      case 'volume':
        this.output.gain.value = Math.max(0, Math.min(1, value));
        break;
      case 'arpeggioTable':
        // 0=no arp, 1-3=table 0-2 — send directly as int
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 5,
            value: Math.max(0, Math.min(3, Math.round(value))),
          });
        }
        break;
      case 'vibratoLevel':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 2,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
      case 'vibratoSpeed':
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 1,
            value: Math.max(0, Math.min(1, value / 63)),
          });
        }
        break;
      case 'speedCounter':
        // Pass tick-within-row as integer (0 = first tick of row)
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 8,
            value,
          });
        }
        break;
      case 'masterVolume':
        // Master volume 0-64
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 9,
            value: Math.max(0, Math.min(64, Math.round(value))),
          });
        }
        break;
      case 'slideSpeed':
        // Direct slide speed as integer
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 10,
            value,
          });
        }
        break;
      case 'effectArpArg':
        // 0xy effect arpeggio arg (0=off, 0xXY=arp offsets) — integer 0-255
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({
            type: 'setParam',
            handle: this._playerHandle,
            paramId: 11,
            value: Math.max(0, Math.min(255, Math.round(value))),
          });
        }
        break;
      case 'setVibrato':
        // SA effect 4: SetVibrato — packed arg 0xXY
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({ type: 'setParam', handle: this._playerHandle, paramId: 12, value });
        }
        break;
      case 'restartAdsr':
        // SA effect 2: RestartAdsr — set ADSR position
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({ type: 'setParam', handle: this._playerHandle, paramId: 13, value });
        }
        break;
      case 'skipPortamento':
        // SA effect 8: zero portamento speed
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({ type: 'setParam', handle: this._playerHandle, paramId: 14, value: 0 });
        }
        break;
      case 'setPortamento':
        // SA effect 7: set portamento speed directly
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({ type: 'setParam', handle: this._playerHandle, paramId: 15, value });
        }
        break;
      case 'setSlideSpeed':
        // SA effect 1: signed byte slide speed
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({ type: 'setParam', handle: this._playerHandle, paramId: 16, value });
        }
        break;
      case 'volumeSlide':
        // SA effect A: signed byte volume slide speed
        if (this._playerHandle >= 0) {
          this.engine.sendMessage({ type: 'setParam', handle: this._playerHandle, paramId: 17, value });
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

  getEngine(): SonicArrangerEngine {
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
      SonicArrangerSynth._engineConnectedToSynth = false;
      this._ownsEngineConnection = false;
    }
  }
}

/**
 * Serialise a SonicArrangerConfig into the binary format expected by sa_load_instrument().
 * Returns an ArrayBuffer that can be transferred to the AudioWorklet.
 */
function serializeSonicArrangerConfig(cfg: SonicArrangerConfig): ArrayBuffer {
  const numWaveforms = cfg.allWaveforms?.length ?? 0;
  const totalLen = 479 + numWaveforms * 128;
  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  let offset = 0;

  // Core params (uint16 LE)
  view.setUint16(offset, cfg.volume & 0xFFFF, true); offset += 2;

  // fineTuning (int8)
  view.setInt8(offset, cfg.fineTuning); offset += 1;

  // Remaining uint16 LE params
  view.setUint16(offset, cfg.waveformNumber & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.waveformLength & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.portamentoSpeed & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.vibratoDelay & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.vibratoSpeed & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.vibratoLevel & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.amfNumber & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.amfDelay & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.amfLength & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.amfRepeat & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.adsrNumber & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.adsrDelay & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.adsrLength & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.adsrRepeat & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.sustainPoint & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.sustainDelay & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.effect & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.effectArg1 & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.effectArg2 & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.effectArg3 & 0xFFFF, true); offset += 2;
  view.setUint16(offset, cfg.effectDelay & 0xFFFF, true); offset += 2;

  // Arpeggios: 3 sub-tables, each 16 bytes (1 length + 1 repeat + 14 values)
  const arps = cfg.arpeggios;
  for (let a = 0; a < 3; a++) {
    const arp = arps[a];
    bytes[offset++] = (arp.length ?? 0) & 0xFF;
    bytes[offset++] = (arp.repeat ?? 0) & 0xFF;
    const vals = arp.values ?? [];
    for (let v = 0; v < 14; v++) {
      view.setInt8(offset++, vals[v] ?? 0);
    }
  }

  // waveformData: 128 bytes of signed int8
  const waveData = cfg.waveformData ?? [];
  for (let i = 0; i < 128; i++) {
    view.setInt8(offset++, waveData[i] ?? 0);
  }

  // adsrTable: 128 bytes of uint8
  const adsrTable = cfg.adsrTable ?? [];
  for (let i = 0; i < 128; i++) {
    bytes[offset++] = (adsrTable[i] ?? 0) & 0xFF;
  }

  // amfTable: 128 bytes of signed int8
  const amfTable = cfg.amfTable ?? [];
  for (let i = 0; i < 128; i++) {
    view.setInt8(offset++, amfTable[i] ?? 0);
  }

  // numWaveforms (uint16 LE)
  view.setUint16(offset, numWaveforms & 0xFFFF, true); offset += 2;

  // allWaveforms: N arrays of 128 signed int8 each
  const allWaveforms = cfg.allWaveforms ?? [];
  for (let w = 0; w < numWaveforms; w++) {
    const wf = allWaveforms[w] ?? [];
    for (let i = 0; i < 128; i++) {
      view.setInt8(offset++, wf[i] ?? 0);
    }
  }

  return buf;
}
