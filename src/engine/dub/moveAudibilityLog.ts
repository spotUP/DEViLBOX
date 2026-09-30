/**
 * Every dub move fire, measured: what it did to the bus input, the dub return
 * and the master output - logged as one line and kept for the MCP.
 *
 * Owner, 2026-09-30: "i think you need to add proper fucking logging and fix
 * this once and for all" - moves lit up and nothing was heard, and the only
 * record of a fire was that it happened. Rolling meters (50 ms RMS) sit on the
 * three nodes. The return is compared PEAK to PEAK - its loudest 50 ms during
 * the move (until release for a held move, 2.5 s for a one-shot) against its
 * loudest in the second before - and the master AVERAGE to AVERAGE, so the
 * music's own swings (±10 dB on a tracker song) do not count as a move. OK
 * when the return peak rises 3 dB or the master average moves 2 dB; SILENT
 * otherwise.
 *
 *   [DubMoveAudit] SILENT combSweep ch0 (ai): input -31.2 -> -30.8, return -38.0 -> -37.5, master -22.1 -> -22.0 dBFS
 */
import { subscribeDubRouter, subscribeDubRelease } from './DubRouter';

type Levels = { input: number; ret: number; master: number };
export type MoveAuditResult = {
  moveId: string; channelId?: number; origin: string; atMs: number;
  before: Levels; peak: Levels; delta: Levels; verdict: 'OK' | 'SILENT';
  /** The return's loudest 50 ms in the second before the fire. */
  beforeRetPeak: number;
};

const TICK_MS = 50;
const HISTORY = 20;           // 1 s of 50 ms readings: the baseline window
const ONE_SHOT_MS = 2500;
const HELD_TAIL_MS = 1500;
const HELD_CAP_MS = 10000;

const results: MoveAuditResult[] = [];
export function getMoveAudit(): MoveAuditResult[] { return results.slice(); }

type Meter = { an: AnalyserNode; buf: Float32Array<ArrayBuffer>; hist: number[] };
type Pending = {
  moveId: string; channelId?: number; origin: string; atMs: number;
  before: Levels; peak: Levels; endAtMs: number; held: boolean; released: boolean;
  /** The return's loudest reading in the baseline second. */
  beforeRetPeak: number;
  /** Master power summed during the move, for its average. */
  masterSum: number; masterN: number;
};

let timer: ReturnType<typeof setInterval> | null = null;
let meters: { input: Meter; ret: Meter; master: Meter } | null = null;
const pending = new Map<string, Pending>();
let unsubs: Array<() => void> = [];

const db = (p: number) => Math.round(10 * Math.log10(Math.max(p, 1e-12)) * 10) / 10;
function meter(node: AudioNode): Meter {
  const an = node.context.createAnalyser();
  an.fftSize = 2048;
  node.connect(an);
  return { an, buf: new Float32Array(2048), hist: [] };
}
function read(m: Meter): number {
  m.an.getFloatTimeDomainData(m.buf);
  let e = 0; for (const v of m.buf) e += v * v;
  const p = e / m.buf.length;
  m.hist.push(p); if (m.hist.length > HISTORY) m.hist.shift();
  return p;
}
const mean = (h: number[]) => (h.length ? h.reduce((a, v) => a + v, 0) / h.length : 0);

function finish(p: Pending): void {
  const masterAvg = db(p.masterN ? p.masterSum / p.masterN : 0);
  p.peak.master = masterAvg;
  const delta = { input: p.peak.input - p.before.input, ret: p.peak.ret - p.beforeRetPeak, master: masterAvg - p.before.master };
  const r = (v: number) => Math.round(v * 10) / 10;
  const verdict: MoveAuditResult['verdict'] = delta.ret >= 3 || Math.abs(delta.master) >= 2 ? 'OK' : 'SILENT';
  const res: MoveAuditResult = {
    moveId: p.moveId, channelId: p.channelId, origin: p.origin, atMs: p.atMs, before: p.before, peak: p.peak, beforeRetPeak: p.beforeRetPeak,
    delta: { input: r(delta.input), ret: r(delta.ret), master: r(delta.master) }, verdict,
  };
  results.push(res); if (results.length > 100) results.shift();
  console.log(`[DubMoveAudit] ${verdict} ${p.moveId}${p.channelId !== undefined ? ` ch${p.channelId}` : ''} (${p.origin}): `
    + `input ${p.before.input} -> ${p.peak.input}, return peak ${p.beforeRetPeak} -> ${p.peak.ret} (${r(delta.ret)} dB), `
    + `master avg ${p.before.master} -> ${masterAvg} (${r(delta.master)} dB) dBFS`);
}

function tick(): void {
  if (!meters) return;
  const now = performance.now();
  const lv = { input: read(meters.input), ret: read(meters.ret), master: read(meters.master) };
  for (const [id, p] of pending) {
    p.peak.input = Math.max(p.peak.input, db(lv.input));
    p.peak.ret = Math.max(p.peak.ret, db(lv.ret));
    p.masterSum += lv.master; p.masterN++;
    if (now >= p.endAtMs || (p.held && !p.released && now - p.atMs > HELD_CAP_MS)) { pending.delete(id); finish(p); }
  }
}

/** Meter a bus's input and return and the master output, and audit every move fire. */
export function installMoveAudibilityLog(nodes: { input: AudioNode; ret: AudioNode; master: AudioNode } | null): void {
  for (const u of unsubs) u();
  unsubs = [];
  if (timer) { clearInterval(timer); timer = null; }
  pending.clear();
  meters = null;
  if (!nodes) return;
  meters = { input: meter(nodes.input), ret: meter(nodes.ret), master: meter(nodes.master) };
  timer = setInterval(tick, TICK_MS);
  unsubs.push(subscribeDubRouter((ev) => {
    if (!meters) return;
    const atMs = performance.now();
    const before = { input: db(mean(meters.input.hist)), ret: db(mean(meters.ret.hist)), master: db(mean(meters.master.hist)) };
    pending.set(ev.invocationId, {
      moveId: ev.moveId, channelId: ev.channelId, origin: ev.origin, atMs, before, peak: { ...before },
      beforeRetPeak: db(Math.max(0, ...meters.ret.hist)), masterSum: 0, masterN: 0,
      endAtMs: ev.isHold ? atMs + HELD_CAP_MS : atMs + ONE_SHOT_MS, held: !!ev.isHold, released: false,
    });
  }));
  unsubs.push(subscribeDubRelease((ev) => {
    const p = pending.get(ev.invocationId);
    if (!p) return;
    p.released = true;
    p.endAtMs = Math.min(p.endAtMs, performance.now() + HELD_TAIL_MS);
  }));
}
