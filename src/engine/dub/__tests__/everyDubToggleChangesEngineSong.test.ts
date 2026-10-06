/**
 * Every dub toggle changes an engine-played song's output.
 *
 * Reported 2026-10-06 on bomb jack.fred (Fred Editor, its own WASM engine):
 * the deck's TOGGLE row (Wide, Wobble, Sub Harm, Liquid, Sweep, Ring, Starve,
 * Ping-Pong) seemed to do nothing. A native engine feeds the bus through a
 * whole-mix tap (NativeEngineRouting -> registerWholeMixTap) at the channel
 * send level - 0.15 after the seeded send - and the dry programme reaches the
 * master through the master insert. This renders the real DubBus in exactly
 * that topology and compares the master output with each toggle off and on.
 *
 * Measured per toggle: RMS of (on - off) over the held window, against the
 * rig's own render-to-render noise (off vs off). The toggle must clear that
 * noise floor by a clear margin.
 *
 * Sub Harm was the dead one: its pulse detector listened to the send bus, where
 * a kick arrives at a third of the detection threshold, so no sub fired.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDubBus, makeDubBusRig, releaseDubBusRigClock, toDb, type DubBusRig } from '@/test/audio/dubBusRig';
import type { DubMove } from '../moves/_types';
import { stereoDoubler } from '../moves/stereoDoubler';
import { tapeWobble } from '../moves/tapeWobble';
import { subHarmonic } from '../moves/subHarmonic';
import { combSweep } from '../moves/combSweep';
import { eqSweep } from '../moves/eqSweep';
import { ringMod } from '../moves/ringMod';
import { voltageStarve } from '../moves/voltageStarve';
import { madProfPingPong } from '../moves/madProfPingPong';

beforeAll(async () => { await loadDubBus(); }, 120_000);
afterAll(() => releaseDubBusRigClock());

/** The deck's toggle row, move id -> what to set before firing it. */
const TOGGLES: ReadonlyArray<{ label: string; move: DubMove; settings?: Record<string, unknown> }> = [
  { label: 'Wide', move: stereoDoubler },
  { label: 'Wobble', move: tapeWobble },
  { label: 'Sub Harm (pulse)', move: subHarmonic, settings: { subHarmonicMode: 'pulse' } },
  { label: 'Sub Harm (bed)', move: subHarmonic, settings: { subHarmonicMode: 'continuous' } },
  { label: 'Liquid', move: combSweep },
  { label: 'Sweep', move: eqSweep },
  { label: 'Ring', move: ringMod },
  { label: 'Starve', move: voltageStarve },
  { label: 'Ping-Pong', move: madProfPingPong },
];

const SECONDS = 2.5;
const SEND = 0.15; // FLAT_SEED_SEND: what a freshly enabled bus is fed with
const FIRE_AT = 0.4;

/** A song-like programme: kick, bass, hats, a stereo lead. Seeded, so both arms hear the same. */
function programme(rig: DubBusRig): GainNode {
  const sr = rig.ctx.sampleRate;
  const n = Math.round(sr * 2);
  const buf = rig.ctx.createBuffer(2, n, sr);
  let seed = 7;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const beat = t % 0.5;
      const kick = Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 8) * 0.6;
      const bass = Math.sin(2 * Math.PI * 55 * t) * 0.25;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const hat = (seed / 4294967296 * 2 - 1) * 0.15 * Math.exp(-(t % 0.25) * 40);
      const lead = Math.sin(2 * Math.PI * (440 + 110 * c) * t) * 0.1;
      d[i] = kick + bass + hat + lead;
    }
  }
  const src = rig.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(0);
  const out = rig.ctx.createGain();
  src.connect(out);
  return out;
}

/** The engine-song topology, then one render with `fire` (or nothing) at FIRE_AT. */
async function renderEngineSong(toggle?: (typeof TOGGLES)[number]): Promise<AudioBuffer> {
  const rig = await makeDubBusRig(SECONDS);
  const song = programme(rig);
  // The programme reaches the master through the insert, as masterEffectsInput does.
  const dest = rig.ctx.createGain();
  dest.connect(rig.ctx.destination);
  rig.bus.registerMasterInsertPoint(song, dest);
  // The engine's whole-mix tap, the way NativeEngineRouting registers it; a
  // Fred song cannot isolate channels, so the fallback is the only way in.
  rig.bus.setEngineIsolation(false);
  rig.bus.registerWholeMixTap('native:FredReplayerWasmSynth2', song);
  rig.bus.setWholeMixDubSend(0, SEND);
  return rig.render([
    { at: 0, run: () => rig.bus.setSettings({ enabled: true, ...(toggle?.settings ?? {}) }) },
    ...(toggle ? [{ at: FIRE_AT, run: () => { toggle.move.execute({ bus: rig.bus, params: { ...toggle.move.defaults }, bpm: 120, source: 'live' }); } }] : []),
  ]);
}

function diffDb(a: AudioBuffer, b: AudioBuffer, from = 1.0, to = SECONDS - 0.05): number {
  let sum = 0;
  let n = 0;
  for (let ch = 0; ch < a.numberOfChannels; ch++) {
    const x = a.getChannelData(ch);
    const y = b.getChannelData(ch);
    for (let i = Math.floor(from * a.sampleRate); i < Math.floor(to * a.sampleRate); i++) { const d = x[i] - y[i]; sum += d * d; n++; }
  }
  return toDb(Math.sqrt(sum / n));
}

describe('every dub toggle changes an engine-played song\'s output', () => {
  it('lists the toggles the deck shows', () => {
    const deck = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'dub', 'DubDeckStrip.tsx'), 'utf8');
    const ids = [...deck.matchAll(/moveId: '(\w+)'[^\n]*group: 'toggle'/g)].map((m) => m[1]).sort();
    const covered = [...new Set(TOGGLES.map((t) => t.move.id))].sort();
    expect(covered).toEqual(ids);
  });

  let off: AudioBuffer;
  let noiseFloorDb: number;
  beforeAll(async () => {
    off = await renderEngineSong();
    noiseFloorDb = diffDb(off, await renderEngineSong());
  }, 120_000);

  it.each(TOGGLES.map((t) => [t.label, t] as const))('%s', async (_label, toggle) => {
    const on = await renderEngineSong(toggle);
    const effect = diffDb(off, on);
    expect(effect, `${toggle.label}: ${effect.toFixed(1)} dBFS against a ${noiseFloorDb.toFixed(1)} dBFS render noise floor`).toBeGreaterThan(noiseFloorDb + 12);
  }, 60_000);
});
