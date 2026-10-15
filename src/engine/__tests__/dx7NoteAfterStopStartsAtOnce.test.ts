/**
 * The first DX7 note after Stop + Play came late, chopped or not at all.
 * Stop sends noteOff plus allNotesOff (twice, via ToneEngine.releaseAll and
 * ChannelRouting.stopVoice). dx7AllNotesOff pushed a key-off for all 61 keys
 * into the firmware's message queue, which the 6303 consumes one event at a
 * time (~1 ms of firmware time each), so 122 bogus key-offs sat ahead of the
 * next note-on for ~125 ms; a note-on that landed mid-flush could be dropped.
 * All Notes Off must release only the keys that are down, so the next note
 * starts as fast as one played from idle.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const NATIVE_RATE = 49096.354;
const BLOCK = 64; // ~1.3 ms per render call
// The firmware ROM is not in git (public/roms/.gitignore); the test runs where it is installed.
const ROM = join(ROOT, 'public/roms/dx7/DX7-V1-8.OBJ');
const present = existsSync(ROM);

interface Dx7Module {
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  _dx7Init: () => number;
  _dx7LoadFirmware: (ptr: number, len: number) => number;
  _dx7NoteOn: (note: number, velocity: number) => void;
  _dx7NoteOff: (note: number) => void;
  _dx7AllNotesOff: () => void;
  _dx7Process: (l: number, r: number, n: number) => void;
  _dx7GetEnvelopeState: (out: number) => number;
}

let b: WebBundle<Dx7Module>;
let outL = 0, outR = 0, env = 0;

beforeAll(async () => {
  if (!present) return;
  b = await loadWebBundle<Dx7Module>(join(ROOT, 'public/dx7/DX7.js'), join(ROOT, 'public/dx7/DX7.wasm'), 'createDX7Module');
  const m = b.module;
  m._dx7Init();
  const rom = new Uint8Array(readFileSync(ROM));
  const p = m._malloc(rom.length);
  b.heap().set(rom, p);
  expect(m._dx7LoadFirmware(p, rom.length)).toBe(0);
  m._free(p);
  outL = m._malloc(BLOCK * 4);
  outR = m._malloc(BLOCK * 4);
  env = m._malloc(384);
  render(1500); // firmware boot
}, 60_000);

function render(ms: number) {
  const blocks = Math.ceil((ms / 1000) * NATIVE_RATE / BLOCK);
  for (let i = 0; i < blocks; i++) b.module._dx7Process(outL, outR, BLOCK);
}

/** True while some voice holds a key (an operator envelope with the key-released flag clear). */
function keyHeld(): boolean {
  if (b.module._dx7GetEnvelopeState(env) === 0) return false;
  const h = b.heap();
  for (let i = 0; i < 16 * 6; i++) if ((h[env + i * 4 + 3] & 1) === 0) return true;
  return false;
}

/** Milliseconds of firmware time from note-on until a voice holds the key; Infinity when it never does. */
function onsetMs(note: number, limitMs = 400): number {
  b.module._dx7NoteOn(note, 100);
  const blocks = Math.ceil((limitMs / 1000) * NATIVE_RATE / BLOCK);
  for (let i = 1; i <= blocks; i++) {
    b.module._dx7Process(outL, outR, BLOCK);
    if (keyHeld()) return (i * BLOCK * 1000) / NATIVE_RATE;
  }
  return Infinity;
}

function stopLikeTheTracker(note: number) {
  b.module._dx7NoteOff(note);
  b.module._dx7AllNotesOff();
  b.module._dx7AllNotesOff();
}

describe('DX7 note after Stop', () => {
  it.skipIf(!present)('starts as fast as a note from idle at every gap after Stop', () => {
    const idle = onsetMs(60);
    expect(idle).toBeLessThan(20);
    b.module._dx7NoteOff(60);
    render(300);

    for (const gapMs of [0, 20, 40, 60, 80, 120]) {
      expect(onsetMs(60)).toBeLessThan(20);
      render(200);
      stopLikeTheTracker(60);
      render(gapMs);
      const after = onsetMs(60);
      expect({ gapMs, after: after < idle + 10 }).toEqual({ gapMs, after: true });
      b.module._dx7NoteOff(60);
      render(300);
    }
  });
});
