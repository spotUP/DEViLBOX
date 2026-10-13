/**
 * The nw_* calls of the Nuade WASM as one class, free of Node and browser APIs: the Node loader (nuadeHeadless.ts), the
 * DJ render worker and the comparison tooling all drive the engine through it. The browser's live path is
 * public/nuade/Nuade.worklet.js, which makes the same calls.
 */
import { cstr, heapBytes, probeWith, type NuadeModule } from './nuadeModule';
export type { NuadeModule } from './nuadeModule';

export const NUADE_CAP_STATE_READ = 1;
export const NUADE_CAP_CELL_WRITE = 2;
export const NUADE_CAP_INSTRUMENT_WRITE = 4;
export const NUADE_CAP_MODULE_WRITE = 8;

export interface NuadeSnapshotVoice { note: number; instrument: number; volume: number; pan: number; active: boolean }
export interface NuadeSnapshotState {
  order: number; pattern: number; row: number; tick: number; speed: number; tempo: number; mode: number; rows: number;
  voices: NuadeSnapshotVoice[];
}

export class NuadeDriver {
  readonly m: NuadeModule;
  readonly sampleRate: number;
  constructor(m: NuadeModule, sampleRate: number) {
    this.m = m;
    this.sampleRate = sampleRate;
  }

  /** One instance per module shares its single song slot: use one at a time. */
  static fromModule(m: NuadeModule, sampleRate = 48000): NuadeDriver {
    m._nw_init(sampleRate);
    return new NuadeDriver(m, sampleRate);
  }

  private cstr(s: string): number { return cstr(this.m, s); }
  private bytes(data: Uint8Array): number { return heapBytes(this.m, data); }

  clearFiles(): void { this.m._nw_clear_files(); }
  addFile(name: string, data: Uint8Array): void {
    const n = this.cstr(name), p = this.bytes(data);
    this.m._nw_add_file(n, p, data.length);
    this.m._free(n); this.m._free(p);
  }

  /** Open `data`; `playerId` forces one player, '' probes all. Throws with nuade's own message on failure. */
  open(data: Uint8Array, fileName: string, playerId = ''): void {
    const p = this.bytes(data), n = this.cstr(fileName), id = this.cstr(playerId);
    const r = this.m._nw_open(p, data.length, n, id);
    this.m._free(p); this.m._free(n); this.m._free(id);
    if (r !== 0) throw new Error(`nuade open failed (${r}): ${this.m.UTF8ToString(this.m._nw_last_error())}`);
  }
  close(): void { this.m._nw_close(); }
  start(subsong: number): boolean { return this.m._nw_start(subsong) === 1; }

  get voiceCount(): number { return this.m._nw_voice_count(); }
  get subsongCount(): number { return this.m._nw_subsong_count(); }
  get defaultSubsong(): number { return this.m._nw_default_subsong(); }
  get playerId(): string { return this.m.UTF8ToString(this.m._nw_player_id()); }
  get playerName(): string { return this.m.UTF8ToString(this.m._nw_player_name()); }
  get caps(): number { return this.m._nw_caps(); }
  get position(): number { return this.m._nw_position(); }
  get lastFlags(): number { return this.m._nw_last_flags(); }
  setMuteMask(mask: number): void { this.m._nw_set_mute_mask(mask); }
  seek(frame: number): boolean { return this.m._nw_seek(frame) === 1; }
  meta(key: string): string {
    const k = this.cstr(key);
    const v = this.m.UTF8ToString(this.m._nw_meta(k));
    this.m._free(k);
    return v;
  }
  /** One player's probe on these bytes: 0 supported, 1 unsupported, 2 unsure, -1 no such player. */
  probeWith(playerId: string, data: Uint8Array, fileName: string): number { return probeWith(this.m, playerId, data, fileName); }
  playerIds(): string[] {
    return Array.from({ length: this.m._nw_player_count() }, (_, i) => this.m.UTF8ToString(this.m._nw_player_id_at(i)));
  }

  /**
   * Render `frames` frames. Returns the interleaved stereo and, when `withVoices`, one mono Float32Array per voice.
   * `flags`: 1 looped, 2 ended. `frames` written can be shorter than asked at the end of a song.
   */
  render(frames: number, withVoices = false): { stereo: Float32Array; voices: Float32Array[]; frames: number; flags: number } {
    const m = this.m, vc = this.voiceCount;
    const sp = m._malloc(frames * 2 * 4);
    const vp = withVoices ? m._malloc(vc * frames * 4) : 0;
    const written = m._nw_render(sp, vp, frames, frames);
    const stereo = m.HEAPF32.slice(sp >> 2, (sp >> 2) + written * 2);
    const voices: Float32Array[] = [];
    if (withVoices) for (let v = 0; v < vc; v++) voices.push(m.HEAPF32.slice((vp >> 2) + v * frames, (vp >> 2) + v * frames + written));
    m._free(sp); if (vp) m._free(vp);
    return { stereo, voices, frames: written, flags: m._nw_last_flags() };
  }

  snapshot(frame: number): NuadeSnapshotState | null {
    const m = this.m, p = m._malloc((10 + 32 * 5) * 4);
    const ok = m._nw_snapshot(frame, p);
    let out: NuadeSnapshotState | null = null;
    if (ok) {
      const w = m.HEAP32.slice(p >> 2, (p >> 2) + 10 + 32 * 5);
      const f = new Float32Array(w.buffer);
      out = { order: w[1], pattern: w[2], row: w[3], tick: w[4], speed: w[5], tempo: w[6], mode: w[8], rows: w[9], voices: [] };
      for (let v = 0; v < w[7]; v++) {
        const i = 10 + v * 5;
        out.voices.push({ note: w[i], instrument: w[i + 1], volume: f[i + 2], pan: f[i + 3], active: w[i + 4] === 1 });
      }
    }
    m._free(p);
    return out;
  }

  /** The pan each voice has in the stereo mix now, -1 left .. 1 right. */
  pans(): number[] {
    const m = this.m, vc = this.voiceCount, p = m._malloc(vc * 4);
    const n = m._nw_pans(p, vc);
    const out = Array.from(m.HEAPF32.slice(p >> 2, (p >> 2) + n));
    m._free(p);
    return out;
  }

  /** Peak of each voice since the previous call. */
  vu(): number[] {
    const m = this.m, vc = this.voiceCount, p = m._malloc(vc * 4);
    const n = m._nw_vu(p, vc);
    const out = Array.from(m.HEAPF32.slice(p >> 2, (p >> 2) + n));
    m._free(p);
    return out;
  }
}
