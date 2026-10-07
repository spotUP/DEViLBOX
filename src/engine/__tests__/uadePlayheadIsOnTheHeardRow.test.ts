/**
 * The row the pattern grid shows while UADE plays a parser-decoded song is the row being HEARD,
 * not the row whose message happened to arrive (plan fix-all-open G18).
 *
 * Owner, 2026-10-07: Rob Hubbard skateordie.rh, the grid's notes are right but the cursor is
 * behind the music by a constant amount. robHubbardPlayheadFollowsUade holds the tick-to-row
 * mapping at the block the tick moved in; this holds the TIME: it runs the real worklet and WASM
 * on a block clock, delivers its position messages to the real UADEEngine.subscribeToCoordinator
 * and the real PlaybackCoordinator, and reads the display ring the way the pattern editor does
 * (PatternEditorCanvas: Tone.now() + 0.01 with Tone's lookAhead set to 0.01 in ToneEngine).
 *
 * Measured before the fix (live, owner's Chrome, outputLatency 28 ms): the worklet posted its
 * position every 50 ms, so a row change reached the main thread up to 50 ms after the tick that
 * started it, and the dispatch queued it at the arrival time instead of audioTime + latency; the
 * row appeared 28-40 ms after it was heard. Now the worklet posts the block the player tick moves
 * in and the subscription passes that block's audioTime on.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { startWorklet, songBuffer, stereoOutputs, type WorkletMsg } from './workletHarness';
import { parseRobHubbardFile } from '@/lib/import/formats/RobHubbardParser';
import { parseSoundMasterFile } from '@/lib/import/formats/SoundMasterParser';
import { parseDscFile } from '@/lib/import/formats/DigitalSonixChromeParser';
import { parseJochenHippelSTFile } from '@/lib/import/formats/JochenHippelSTParser';
import { playerTickGridPosition, type TickGrid } from '@/lib/tracker/tickGridPosition';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';
import { UADEEngine, uadeTransform } from '@/engine/uade/UADEEngine';
import { PlaybackCoordinator } from '@/engine/PlaybackCoordinator';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const OUTPUT_LATENCY = 0.028;   // measured in the owner's Chrome
const MESSAGE_DELAY = 0.010;    // worklet to main thread, measured 0-24 ms
const DISPLAY_READ_AHEAD = 0.02; // PatternEditorCanvas: Tone.now() (+ lookAhead 0.01) + 0.01
const BLOCK = 128 / 48000;

type Case = { name: string; path: string; seconds: number; parse: (buf: ArrayBuffer, file: string) => TrackerSong | Promise<TrackerSong> };
const CASES: Case[] = [
  { name: 'Rob Hubbard', path: 'public/data/songs/rob-hubbard/skateordie.rh', seconds: 20, parse: parseRobHubbardFile },
  { name: 'Sound Master', path: "public/data/songs/sound-master/rackney'sisland 4.sm", seconds: 15, parse: parseSoundMasterFile },
  { name: 'Digital Sonix and Chrome', path: "public/data/songs/digital-sonix-and-chrome/David Hanlon/dragon'sbreath ingame 1.dsc", seconds: 15, parse: (b, f) => parseDscFile(b, f, 0) },
  { name: 'Jochen Hippel ST', path: 'public/data/songs/hippel-st/crown arabia.hst', seconds: 15, parse: (b, f) => parseJochenHippelSTFile(b, f, 0) },
];

async function lags(c: Case): Promise<{ n: number; min: number; max: number; tickGrid: boolean }> {
  const file = c.path.split('/').pop()!;
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), c.path)));
  const song = await c.parse(bytes.slice().buffer as ArrayBuffer, file);
  if (song.uadePlayerTickGrid !== true) return { n: 0, min: 0, max: 0, tickGrid: false };
  const grid: TickGrid = {
    speed: song.initialSpeed, songPositions: song.songPositions,
    patternLengths: song.patterns.map((p) => p.length), loopFrom: song.restartPosition ?? 0,
  };

  const g = globalThis as { __workletClock?: number };
  g.__workletClock = 0;
  const { proc, send, posted } = await startWorklet('uade', 'UADE', async (code) => uadeTransform(code), 'UADE', true);
  await send({ type: 'load', buffer: songBuffer(c.path), filenameHint: uadePlayerHint(file), skipScan: true, subsong: 0, pinSubsong: false });
  await send({ type: 'play' });

  // The real subscription on the real coordinator; only the transport (worklet port, audio clock) is modelled.
  const audioContext = { currentTime: 0, outputLatency: OUTPUT_LATENCY };
  const coordinator = new PlaybackCoordinator();
  coordinator.stateRing.playing = true;
  coordinator.context.songPositions = song.songPositions;
  coordinator.context.audioContext = audioContext as unknown as AudioContext;
  const engine = Object.create(UADEEngine.prototype) as {
    _positionCallbacks: Set<(u: unknown) => void>;
    enablePaulaLog(on: boolean): void;
    subscribeToCoordinator: UADEEngine['subscribeToCoordinator'];
  };
  engine._positionCallbacks = new Set();
  engine.enablePaulaLog = () => {};
  const unsubscribe = engine.subscribeToCoordinator(coordinator, song, () => true);

  const key = (p: { songPos: number; row: number }) => p.songPos * 10_000 + p.row;
  const heardAt = new Map<number, number>();   // row key -> the moment its first tick is heard
  const shown: Array<[number, number]> = [];   // [block time, row key on screen]
  const pending: Array<{ at: number; msg: WorkletMsg }> = [];
  let seenMessages = 0;
  let topKey = -1;
  const blocks = Math.ceil((48000 * c.seconds) / 128);
  try {
    for (let b = 0; b < blocks; b++) {
      const clock = b * BLOCK;
      g.__workletClock = clock;
      proc.process([], stereoOutputs(37));
      const ticks = (proc._wasm as { _uade_wasm_get_player_tick_count(): number })._uade_wasm_get_player_tick_count();
      if (ticks > 0) {
        const k = key(playerTickGridPosition(ticks, grid));
        if (k > topKey) { topKey = k; heardAt.set(k, clock + OUTPUT_LATENCY); }
      }
      for (; seenMessages < posted.length; seenMessages++) {
        if (posted[seenMessages].type === 'position') pending.push({ at: clock + MESSAGE_DELAY, msg: posted[seenMessages] });
      }
      while (pending.length > 0 && pending[0].at <= clock) {
        const p = pending.shift()!;
        audioContext.currentTime = p.at;
        for (const cb of engine._positionCallbacks) cb(p.msg);
      }
      audioContext.currentTime = clock;
      const st = coordinator.getStateAtTime(clock + DISPLAY_READ_AHEAD, true);
      shown.push([clock, st ? st.position * 10_000 + st.row : -1]);
    }
  } finally { unsubscribe(); }

  const out: number[] = [];
  for (const [k, h] of heardAt) {
    if (k === 0) continue;   // row 0 is shown at play, before any tick
    const first = shown.find(([, shownKey]) => shownKey >= k);
    if (!first) { if (h < c.seconds - 0.2) out.push(Infinity); continue; }   // rows heard in the last moments are not on screen yet
    out.push(first[0] - h);
  }
  return { n: out.length, min: Math.min(...out), max: Math.max(...out), tickGrid: true };
}

describe('UADE playhead shows the row that is heard', { timeout: 180_000 }, () => {
  for (const c of CASES) {
    it(`${c.name}: a row is on screen no later than it is heard and not before the display read-ahead`, async () => {
      const r = await lags(c);
      if (!r.tickGrid) return;   // this file's grid is not on the player clock: nothing to time
      console.info(`[lag] ${c.name}: ${r.n} rows, on screen ${(r.min * 1000).toFixed(0)} to ${(r.max * 1000).toFixed(0)} ms after heard`);
      expect(r.n).toBeGreaterThan(40);
      // lag = on-screen time minus heard time. The screen reads 20 ms ahead, so a row is due
      // about 20 ms before it is heard; 10 ms past the heard moment is the owner's "behind".
      expect(r.max, `${c.name} latest row appeared ${(r.max * 1000).toFixed(0)} ms after it was heard`).toBeLessThanOrEqual(0.010);
      expect(r.min, `${c.name} earliest row appeared ${(-r.min * 1000).toFixed(0)} ms before it was heard`).toBeGreaterThanOrEqual(-0.035);
    });
  }
});
