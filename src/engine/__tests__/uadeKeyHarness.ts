/**
 * What the UADE sampler-key tests share: the song as UADE plays one voice of it, the key as the real
 * ToneEngine plays it (offline), and the model of what Paula makes of a sample.
 */
import { vi } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';

export const SR = 48000; // the UADE worklet's and the fundamentalHz helper's rate
const uadeTransform = async (c: string) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c);

export interface Shape {
  voice: number; period: number; volume: number; firstChunk: number; count: number;
  attackPtr: number; attackLen: number; loopPtr: number | null; loopLen: number;
  pcm: ArrayBuffer; loopStart: number; loopLength: number;
}

/** Frames of a Sampler instrument's WAV, as signed 8-bit units. */
export function instrumentBytes(inst: InstrumentConfig): { bytes: Int16Array; loopStart: number; loopEnd: number; loop: boolean } | null {
  const ab = inst.sample?.audioBuffer;
  if (!ab) return null;
  const dv = new DataView(ab);
  let off = 12, dataOff = -1, dataLen = 0;
  while (off < ab.byteLength - 8) {
    const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
    const len = dv.getUint32(off + 4, true);
    if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
    off += 8 + len + (len & 1);
  }
  if (dataOff < 0) return null;
  const bits = dv.getUint16(34, true);
  const n = dataLen / (bits / 8);
  const bytes = new Int16Array(n);
  for (let i = 0; i < n; i++) bytes[i] = bits === 16 ? Math.round(dv.getInt16(dataOff + i * 2, true) / 256) : dv.getUint8(dataOff + i) - 128;
  return { bytes, loopStart: inst.sample!.loopStart, loopEnd: inst.sample!.loopEnd, loop: !!inst.sample!.loop };
}

export function sameSample(inst: InstrumentConfig, sh: Shape): boolean {
  const got = instrumentBytes(inst);
  if (!got) return false;
  const want = new Int8Array(sh.pcm);
  if (got.bytes.length < want.length) return false; // a short wave is padded in the WAV
  for (let i = 0; i < want.length; i++) if (Math.abs(got.bytes[i] - want[i]) > 1) return false;
  if (sh.loopLength > 0) return got.loop && got.loopStart === sh.loopStart && got.loopEnd === sh.loopStart + sh.loopLength;
  return !got.loop;
}

/** The song, UADE, with every voice but `voice` muted, from the start. Left + right of one voice are the same signal on one side. */
export async function isolatedVoice(file: string, companions: Record<string, string> | undefined, voice: number, secs: number): Promise<Float32Array> {
  const w = await startWorklet('uade', 'UADE', uadeTransform);
  const list = Object.entries(companions ?? {}).map(([filename, p]) => ({ filename, buffer: songBuffer('public/data/songs/' + p) }));
  await w.send({ type: 'load', buffer: songBuffer('public/data/songs/' + file), filenameHint: file.split('/')[1], skipScan: true, subsong: 0, companions: list });
  await w.send({ type: 'setMuteMask', mask: 1 << voice });
  await w.send({ type: 'play' });
  const quanta = Math.floor((48000 * secs) / 128);
  const out = new Float32Array(quanta * 128);
  for (let q = 0; q < quanta; q++) {
    const o = stereoOutputs(37);
    w.proc.process([], o);
    for (let k = 0; k < 128; k++) out[q * 128 + k] = o[0][0][k] + o[0][1][k];
  }
  return out;
}

export interface KeyPress { note: string; at: number }
/** The instrument on the real ToneEngine, rendered offline: what the keyboard plays. One render per call (a fresh engine). */
export async function renderKeys(config: InstrumentConfig, presses: KeyPress[], secs: number): Promise<Float32Array> {
  vi.resetModules();
  installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch();
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  Tone.setContext(ctx as unknown as AudioContext);
  const g = globalThis as unknown as Record<string, unknown>;
  const win = g.window as Record<string, unknown>;
  const Real = g.AudioContext;
  const One = function () { return ctx; } as unknown;
  g.AudioContext = One; win.AudioContext = One;
  try {
    const { useInstrumentStore } = await import('@stores/useInstrumentStore');
    const { getToneEngine } = await import('@engine/ToneEngine');
    useInstrumentStore.setState({ instruments: [config] });
    const engine = getToneEngine();
    const cfg = useInstrumentStore.getState().instruments[0];
    await engine.preloadInstruments([cfg]);
    await audioLoadsSettled();
    vi.spyOn(engine as unknown as { isContextActuallyRunning(): boolean }, 'isContextActuallyRunning').mockReturnValue(true);
    for (const p of presses) {
      engine.triggerNoteAttack(cfg.id, p.note, p.at, 1, cfg, undefined, false, false); // as useNoteInput's keydown
    }
    const out = await ctx.startRendering();
    return out.getChannelData(0).slice();
  } finally {
    g.AudioContext = Real; win.AudioContext = Real;
  }
}

/** What Paula makes of a sample: the bytes at 3546895 / period per second, looped as the shape says, at UADE's output gain. */
export function paulaVoice(sh: Shape, frames: number): Float32Array {
  const bytes = new Int8Array(sh.pcm);
  const out = new Float32Array(frames);
  const step = 3546895 / sh.period / SR;
  const gain = (sh.volume / 64) * 0.48 / 128;
  let pos = 0;
  for (let i = 0; i < frames; i++) {
    let j = Math.floor(pos);
    if (sh.loopLength > 0 && j >= sh.loopStart + sh.loopLength) { pos = sh.loopStart + ((pos - sh.loopStart) % sh.loopLength); j = Math.floor(pos); }
    out[i] = j < bytes.length ? bytes[j] * gain : 0;
    pos += step;
  }
  return out;
}

export const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};


/** Best normalised cross-correlation of `a` against `b` over lags of +-maxLag frames: 1 = the same waveform at the same pitch. */
export function bestNcc(a: Float32Array, b: Float32Array, maxLag: number): number {
  let best = -1;
  for (let lag = -maxLag; lag <= maxLag; lag += 2) {
    let s = 0, ea = 0, eb = 0;
    for (let i = Math.max(0, -lag); i < a.length && i + lag < b.length; i++) { s += a[i] * b[i + lag]; ea += a[i] * a[i]; eb += b[i + lag] * b[i + lag]; }
    best = Math.max(best, s / Math.sqrt(ea * eb + 1e-18));
  }
  return best;
}
