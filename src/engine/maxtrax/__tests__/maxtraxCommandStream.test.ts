// Transpile lockstep regression — MaxTrax audio.device command stream.
//
// UADE (the ground-truth oracle) drives the original 68k replayer through a
// faithful audio.device. Over a MaxTrax song it issues a stream dominated by
// ADCMD_PERVOL (volume-envelope ramps), interleaved with a smaller number of
// CMD_WRITE (note-on sample starts) and CMD_FLUSH events. Ground-truth
// histogram for antmusic.mxtx over ~6s: 1200 PERVOL, 132 FLUSH, 122 WRITE.
//
// The transpiled WASM replayer must reproduce those proportions. The bug this
// test guards: the harness collapsed every AmigaOS message port into ONE
// shared ring, so the IOF_QUICK `_audio_env` PERVOL block leaked into
// `_play_port`'s free pool where a later note-on GetMsg grabbed it and
// overwrote its IO_COMMAND (ADCMD_PERVOL -> CMD_WRITE), collapsing the entire
// envelope stream. With the single ring, PERVOL count crashes to ~5 and
// CMD_WRITE dominates. Port-keyed rings restore the AmigaOS port separation.
//
// This is the sanctioned lockstep comparison for MaxTrax (WAV-accuracy testing
// is disallowed for this format): assert the command histogram, not samples.
//
// The production WASM factory is an emscripten CJS bundle that vitest's module
// transform mangles, so the render runs in a plain `node` child process via
// maxtraxCommandStreamRunner.cjs and reports the histogram as JSON.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const RUNNER = join(HERE, 'maxtraxCommandStreamRunner.cjs');
const JS_PATH = join(ROOT, 'public/maxtrax/Maxtrax.js');
const WASM_PATH = join(ROOT, 'public/maxtrax/Maxtrax.wasm');
const SONG_PATH = join(ROOT, 'public/data/songs/maxtrax/antmusic.mxtx');
// darkseed sets the MaxTrax velocity flag (mxtx_Flags bit), which antmusic does
// not. That flag path exposed a transpiler struct-offset collision: a BSET on
// mxtx_Flags overwrote the adjacent mxtx_ReadFunc pointer (both mis-computed to
// offset 4), so the next indirect ReadFunc call read a garbage function pointer
// -> WASM "table index is out of bounds" at load -> the whole song was silent.
const DARKSEED_PATH = join(ROOT, 'public/data/songs/maxtrax/darkseed (00).mxtx');

interface Counts {
  loadResult: number;
  sampleRate: number;
  framesRendered: number;
  write: number;
  flush: number;
  pervol: number;
  other: number;
  seedPoolDepth: number;
}

function renderCommandHistogram(seconds: number, songPath: string = SONG_PATH): Counts {
  const out = execFileSync(
    process.execPath,
    [RUNNER, JS_PATH, WASM_PATH, songPath, String(seconds)],
    { encoding: 'utf8', timeout: 60_000 },
  );
  return JSON.parse(out) as Counts;
}

describe('MaxTrax transpile — audio.device command stream (UADE lockstep)', () => {
  let counts: Counts;

  beforeAll(() => {
    counts = renderCommandHistogram(6);
  }, 60_000);

  it('loads the song and renders audio', () => {
    expect(counts.loadResult).toBe(0);
    expect(counts.framesRendered).toBeGreaterThan(0);
  });

  it('emits a healthy volume-envelope (PERVOL) stream', () => {
    // With the port-conflation bug the env block is clobbered and PERVOL
    // collapses to a handful. A correct run issues hundreds over 6s.
    expect(counts.pervol).toBeGreaterThan(100);
  });

  it('keeps PERVOL dominant over CMD_WRITE (envelope not collapsed into restarts)', () => {
    // The corruption inverts the ratio: note-on CMD_WRITE floods the stream
    // while PERVOL starves. UADE's ratio is ~10:1 PERVOL:WRITE. Require the
    // envelope stream to strongly dominate.
    expect(counts.pervol).toBeGreaterThan(counts.write * 3);
  });

  it('never mislabels the command stream as "other" (unknown opcodes)', () => {
    // A clobbered IO_COMMAND would surface as garbage opcodes counted in
    // bucket 3. A clean stream is entirely WRITE/FLUSH/PERVOL.
    expect(counts.other).toBe(0);
  });

  it('seeds the OpenMusic free-block pool with 3*NUM_VOICES (=12) CMD_WRITE blocks', () => {
    // OpenMusic seeds `3*NUM_VOICES` (=12) CMD_WRITE blocks into the _play_port
    // free pool during init, all enqueued before the first note-on dequeues one.
    // The seed count is `#3*NUM_VOICES-1` (=11 → 12 blocks). If the transpiler
    // mis-evaluates that immediate to its leading digit (3 → 4 blocks), the
    // starved pool drops note-ons that can't grab a free block: notes vanish and
    // the song plays as "random samples". The harness reports the pre-playback
    // seed-phase peak pool depth: correct=12, seed-bug=4. Require the full seed.
    expect(counts.seedPoolDepth).toBeGreaterThanOrEqual(12);
  });
});

describe('MaxTrax transpile — velocity-flag song loads and renders (struct-offset regression)', () => {
  // With the struct-offset collision, loading darkseed threw a WASM "table index
  // is out of bounds" (garbage ReadFunc pointer), so execFileSync would fail.
  // A correct build loads it (loadResult=0), renders audio, and — because the
  // BSET no longer clobbers ReadFunc — emits a healthy, well-formed command
  // stream (no "other"/garbage opcodes).
  let counts: Counts;

  beforeAll(() => {
    counts = renderCommandHistogram(6, DARKSEED_PATH);
  }, 60_000);

  it('loads darkseed (velocity flag set) without a table-index crash', () => {
    expect(counts.loadResult).toBe(0);
    expect(counts.framesRendered).toBeGreaterThan(0);
  });

  it('renders a healthy PERVOL stream with no garbage opcodes', () => {
    expect(counts.pervol).toBeGreaterThan(100);
    expect(counts.other).toBe(0);
  });
});
