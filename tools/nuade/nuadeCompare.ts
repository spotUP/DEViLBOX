/**
 * nuadeCompare.ts - render a module through nuade (public/nuade/Nuade.wasm, headless) and measure it against UADE
 * (plan D8, NC-1). The metric is the one the eagleplayer runner already uses (eagleCompare.ts: 100 ms loudness
 * envelope of the mono sum, Pearson correlation) and the UADE render is uadeRenderCore's; nothing new is measured.
 *
 * METRIC (measured, 2026-10-13, instrument check NC-3): the research's own metric, 20 ms loudness envelope of the mono
 * sum, Pearson correlation at the best lag within +-200 ms. The eagleCompare metric (100 ms windows, lag 0) is NOT used:
 * the UADE wasm render starts about 20 ms after nuade's (measured on antidust.bp3), which 100 ms windows turn into
 * 0.90 where the aligned 20 ms envelopes give 0.98. The lag is recorded in every row and a lag above 100 ms fails the
 * song, so the search cannot hide a real timing error. `correlation` is eagleCompare's.
 *
 * UADE's A500 filter: the shipped UADE.wasm renders with it ON and has no switch (entry.c sends no filter command),
 * so "filter off on both sides" is not available without rebuilding the shipped binary. Measured instead: UADE wasm
 * against native uade123 --filter=NONE 0.992 and against --filter=A500 0.996 (antidust.bp3, 100 ms), i.e. the filter
 * moves a score by about 0.005, far under the 0.95 / 0.90 thresholds; the instrument check below carries the proof.
 *
 * Ends: a side's song end is its flagged end, else the start of a silent tail of 2 s or more at the end of the
 * render (apb.dw stops sounding at 4.2 s without a flag). Windows are compared up to half a second before the first
 * end of either side; a differing end is judged by the end rule (verdictRules.ts), not hidden by the window.
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NuadeHeadless } from '../../src/engine/nuade/nuadeHeadless';
import { renderFileToSamples, type Companion } from '../uade-audit/uadeRenderCore';
import { correlation } from '../eagleplayer/eagleCompare';
import type { NuadeFormat } from '../../src/engine/nuade/nuadeFormats';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SR = 48000;
const CHUNK = 4800;

export interface NuadeRender {
  samples: Float32Array; // interleaved stereo
  /** Seconds at which nuade first reports the song ended (flags & 2), -1 when it runs on. */
  endAt: number;
  peak: number;
  rms: number;
  voices: number;
  player: string;
  error?: string;
}

export function levelOf(x: Float32Array): { peak: number; rms: number } {
  let peak = 0, sum = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; sum += x[i] * x[i]; }
  return { peak, rms: Math.sqrt(sum / Math.max(1, x.length)) };
}

/** Companion files of one corpus song, named as the player opens them. */
export function companionsOf(row: NuadeFormat, song: string): Companion[] {
  return (row.companions?.[song] ?? []).map((p) => ({ name: basename(p), data: new Uint8Array(readFileSync(join(ROOT, p))) }));
}

/** Render `seconds` of `bytes` on the forced player. Errors are returned, never thrown (a bad module is a row, not a crash). */
export async function renderNuade(nu: NuadeHeadless, bytes: Uint8Array, fileName: string, playerId: string, seconds: number, companions: Companion[] = []): Promise<NuadeRender> {
  const empty: NuadeRender = { samples: new Float32Array(0), endAt: -1, peak: 0, rms: 0, voices: 0, player: '' };
  try {
    nu.clearFiles();
    for (const c of companions) nu.addFile(c.name, c.data);
    nu.open(bytes, fileName, playerId);
    if (!nu.start(nu.defaultSubsong)) { nu.close(); return { ...empty, error: 'nw_start refused the default subsong' }; }
    // UADE is rendered with looping off (one subsong, uade123 -1): it stops at the song's first loop point. The matching
    // nuade setting ends the song at its first loop point (default 0 plays on through every loop point).
    nu.m._nw_set_repeat(1);
    const total = SR * seconds, out = new Float32Array(total * 2);
    let done = 0, endAt = -1;
    while (done < total) {
      const r = nu.render(Math.min(CHUNK, total - done));
      out.set(r.stereo, done * 2);
      done += r.frames;
      if (endAt < 0 && (r.flags & 2)) endAt = done / SR;
      if (r.frames === 0) break;
    }
    const res: NuadeRender = { samples: out.subarray(0, done * 2), endAt, ...levelOf(out.subarray(0, done * 2)), voices: nu.voiceCount, player: nu.playerId };
    nu.close();
    return res;
  } catch (e) {
    try { nu.close(); } catch { /* nothing open */ }
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Edit-path timing: the time nuade needs to open the module and seek to `atSeconds` of playback, which is what the
 * worklet does on a live module swap (swapModule). Plan gate (d) wants <= 100 ms at the 120 s mark.
 */
export async function measureSwapMs(nu: NuadeHeadless, bytes: Uint8Array, fileName: string, playerId: string, atSeconds = 120, companions: Companion[] = []): Promise<number> {
  nu.clearFiles();
  for (const c of companions) nu.addFile(c.name, c.data);
  const t0 = performance.now();
  nu.open(bytes, fileName, playerId);
  nu.start(nu.defaultSubsong);
  nu.seek(Math.round(atSeconds * SR));
  const ms = performance.now() - t0;
  nu.close();
  return ms;
}

export interface SongComparison {
  correlation: number;
  /** Best lag of nuade against UADE in ms (positive: nuade is later). */
  lagMs: number;
  windowSecs: number;
  uadeEndAt: number;
  nuadeEndAt: number;
  peak: number;
  rms: number;
  voices: number;
  player: string;
  uadeRms: number;
  /** Dual rows: our engine against UADE (same windows and metric); null when the engine has no headless render. */
  own?: number | null;
  ownError?: string;
  ownRefused?: boolean;
  error?: string;
}

const ENV_MS = 20;
const MAX_LAG_WINDOWS = 10;

/** 20 ms loudness envelope of the mono sum (L + R) of interleaved stereo. */
export function envelope20(stereo: Float32Array, sampleRate: number): number[] {
  const w = Math.round((sampleRate * ENV_MS) / 1000), out: number[] = [];
  for (let k = 0; (k + 1) * w * 2 <= stereo.length; k++) {
    let s = 0;
    for (let i = k * w; i < (k + 1) * w; i++) { const m = stereo[2 * i] + stereo[2 * i + 1]; s += m * m; }
    out.push(Math.sqrt(s / w));
  }
  return out;
}

/** Best Pearson correlation of `a` against `b` over the first `n` windows, searching +-MAX_LAG_WINDOWS. */
export function bestLagCorrelation(a: number[], b: number[], n: number): { correlation: number; lagWindows: number } {
  let best = { correlation: -2, lagWindows: 0 };
  for (let lag = -MAX_LAG_WINDOWS; lag <= MAX_LAG_WINDOWS; lag++) {
    const x = lag >= 0 ? a.slice(lag) : a;
    const y = lag >= 0 ? b : b.slice(-lag);
    const m = Math.min(n, x.length, y.length);
    if (m < 20) continue;
    const c = correlation(x.slice(0, m), y.slice(0, m));
    if (c > best.correlation) best = { correlation: c, lagWindows: lag };
  }
  return best;
}

/** A side's song end: its flagged end, else the start of a silent tail of >= 2 s; -1 when it plays to the end of the render. */
export function songEndOf(flaggedEndAt: number, stereo: Float32Array, sampleRate: number, seconds: number): number {
  if (flaggedEndAt > 0) return flaggedEndAt;
  const total = Math.floor(stereo.length / 2);
  if (total < sampleRate * seconds * 0.99 && total > 0) return total / sampleRate; // the render itself stopped early
  let lastLoud = -1;
  for (let i = total - 1; i >= 0; i--) if (Math.abs(stereo[2 * i]) > 1e-3 || Math.abs(stereo[2 * i + 1]) > 1e-3) { lastLoud = i; break; }
  const tail = (total - 1 - lastLoud) / sampleRate;
  return tail >= 2 ? (lastLoud + 1) / sampleRate : -1;
}

export async function compareSong(nu: NuadeHeadless, row: NuadeFormat, song: string, seconds = 30): Promise<SongComparison> {
  const bytes = new Uint8Array(readFileSync(join(ROOT, song)));
  const name = basename(song);
  const companions = companionsOf(row, song);
  const mine = await renderNuade(nu, bytes, name, row.id, seconds, companions);
  const uade = await renderFileToSamples(bytes, name, { sampleRate: SR, seconds, companions });
  const uadeEndAt = songEndOf(-1, uade.samples, SR, seconds);
  const nuadeEndAt = songEndOf(mine.endAt, mine.samples, SR, seconds);
  const ends = [nuadeEndAt, uadeEndAt].filter((e) => e > 0);
  const windows = Math.floor(((ends.length ? Math.min(seconds, Math.min(...ends) - 0.5) : seconds) * 1000) / ENV_MS);
  const best = windows > 40 ? bestLagCorrelation(envelope20(mine.samples, SR), envelope20(uade.samples, SR), windows) : { correlation: NaN, lagWindows: 0 };
  let own: number | null | undefined;
  let ownError: string | undefined;
  let ownRefused = false;
  if (row.role === 'dual') {
    const { renderOwn } = await import('./ownRender');
    const o = await renderOwn(row.id, song, seconds);
    if (!o) own = null;
    else if (o.error || windows <= 40) {
      own = null; ownError = o.error ?? 'too little music to compare';
      // A variant our engine refuses by design: Sonic Arranger's 0x4EFA form (NAB-2 routes it to nuade); SUN-Tronic's compiled .sun files (the engine plays V1.3 score modules).
      ownRefused = !!o.error && /unsupported format|not a hunk executable/.test(o.error);
    }
    else own = bestLagCorrelation(envelope20(o.samples, SR), envelope20(uade.samples, SR), windows).correlation;
    if (own !== null && !Number.isFinite(own)) { own = null; ownError = 'no correlation'; }
  }
  return {
    ...(row.role === 'dual' ? { own, ...(ownError ? { ownError } : {}), ...(ownRefused ? { ownRefused } : {}) } : {}),
    correlation: best.correlation, lagMs: best.lagWindows * ENV_MS, windowSecs: (windows * ENV_MS) / 1000, uadeEndAt, nuadeEndAt,
    peak: mine.peak, rms: mine.rms, voices: mine.voices, player: mine.player, uadeRms: levelOf(uade.samples).rms,
    ...(mine.error ? { error: mine.error } : {}),
  };
}

export function sha1(bytes: Uint8Array): string { return createHash('sha1').update(bytes).digest('hex').slice(0, 12); }
