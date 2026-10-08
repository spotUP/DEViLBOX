/**
 * Reference register stream of a Furnace / DefleMask song, for the register
 * lock-step test (src/engine/__tests__/furnaceRegisterLockstep.test.ts).
 *
 * The upstream Furnace CLI exports the song as .vgm (`-vgmout`): every register
 * write each chip platform makes, tick by tick (DivDispatch::getRegisterWrites,
 * the same dump our WASM wrapper exposes as furnace_dispatch_reg_writes). This
 * tool reads the .vgm back into per-chip (address, value) writes and stores the
 * first N seconds as a fixture, with the reference render's level (RMS, peak,
 * clipped samples) from a float WAV export of the same song.
 *
 * It also stores the sequencer commands `-view commands` prints for the first
 * seconds * 50 ticks (notes, instruments, panning and the effect hints).
 *
 * The command lock-step (compare-cmds.ts) cannot see slides: Furnace's
 * `-view commands` suppresses PITCH, NOTE_PORTA, VOLUME and LEGATO. Registers
 * carry every slide, vibrato, volume and wave step as the chip hears it.
 *
 * Usage:
 *   npx tsx tools/furnace-audit/vgm-register-fixture.ts <song.fur|.dmf> <out.json> [seconds=10]
 * Needs the reference CLI at /Users/spot/Code/Reference Code/furnace-master/build-headless/furnace.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { normalizeWrite, parseCommandView, type ChipKind, type ChipStream, type RegisterFixture } from '../../src/engine/__tests__/helpers/furnaceRegisterStream';

const FURNACE = '/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace';

/** Writes per chip kind, grouped per tick (wait) and cut at `seconds` of VGM time. */
export function parseVgm(d: Uint8Array, seconds: number): Record<ChipKind, number[][][]> {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const version = dv.getUint32(8, true);
  let p = version >= 0x150 ? 0x34 + dv.getUint32(0x34, true) : 0x40;
  const frames: Record<ChipKind, number[][][]> = { opn: [[]], psg: [[]], gb: [[]], pce: [[]], nes: [[]] };
  let t = 0;
  const limit = seconds * 44100;
  const put = (k: ChipKind, a: number, v: number) => {
    const w = normalizeWrite(k, a, v);
    if (w) frames[k][frames[k].length - 1].push(w);
  };
  const wait = (n: number) => {
    t += n;
    for (const k of Object.keys(frames) as ChipKind[]) if (frames[k][frames[k].length - 1].length) frames[k].push([]);
  };
  while (p < d.length && t < limit) {
    const c = d[p];
    if (c === 0x66) break;
    if (c === 0x52) { put('opn', d[p + 1], d[p + 2]); p += 3; }
    else if (c === 0x53) { put('opn', 0x100 | d[p + 1], d[p + 2]); p += 3; }
    else if (c === 0x50) { put('psg', 0, d[p + 1]); p += 2; }
    else if (c === 0x4f) { put('psg', 1, d[p + 1]); p += 2; }
    else if (c === 0xb3) { put('gb', d[p + 1] + 16, d[p + 2]); p += 3; }
    else if (c === 0xb9) { put('pce', d[p + 1], d[p + 2]); p += 3; }
    else if (c === 0xb4) { put('nes', d[p + 1], d[p + 2]); p += 3; }
    else if (c === 0x61) { wait(dv.getUint16(p + 1, true)); p += 3; }
    else if (c === 0x62) { wait(735); p += 1; }
    else if (c === 0x63) { wait(882); p += 1; }
    else if (c >= 0x70 && c <= 0x7f) { wait(c - 0x6f); p += 1; }
    else if (c >= 0x80 && c <= 0x8f) { wait(c - 0x80); p += 1; }
    else if (c === 0x67) { p += 7 + dv.getUint32(p + 3, true); }
    else if (c === 0x90 || c === 0x91 || c === 0x95 || c === 0xe0) p += 5;
    else if (c === 0x92) p += 6;
    else if (c === 0x93) p += 11;
    else if (c === 0x94) p += 2;
    else if (c >= 0x30 && c <= 0x3f) p += 2;
    else if ((c >= 0x40 && c <= 0x5f) || (c >= 0xa0 && c <= 0xbf)) p += 3;
    else if (c >= 0xc0 && c <= 0xdf) p += 4;
    else if (c >= 0xe1) p += 5;
    else throw new Error(`unknown VGM command 0x${c.toString(16)} at ${p}`);
  }
  for (const k of Object.keys(frames) as ChipKind[]) frames[k] = frames[k].filter((f) => f.length > 0);
  return frames;
}

/** RMS, peak and clipped-sample count of the first `seconds` of a float32 WAV. */
function wavLevel(d: Uint8Array, seconds: number): RegisterFixture['reference'] {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let p = 12, rate = 44100, chans = 2;
  while (p + 8 <= d.length) {
    const id = String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]);
    const size = dv.getUint32(p + 4, true);
    if (id === 'fmt ') { chans = dv.getUint16(p + 10, true); rate = dv.getUint32(p + 12, true); }
    if (id === 'data') {
      const n = Math.min(size / 4, rate * chans * seconds);
      let ss = 0, peak = 0, clipped = 0;
      for (let i = 0; i < n; i++) {
        const v = dv.getFloat32(p + 8 + i * 4, true);
        ss += v * v; const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clipped++;
      }
      return { rmsDb: Math.round(10 * Math.log10(ss / n + 1e-12) * 10) / 10, peak: Math.round(peak * 1000) / 1000, clipped };
    }
    p += 8 + size;
  }
  throw new Error('no data chunk');
}

function main() {
  const [song, out, secArg] = process.argv.slice(2);
  if (!song || !out) { console.error('usage: vgm-register-fixture.ts <song> <out.json> [seconds]'); process.exit(2); }
  const seconds = Number(secArg ?? 10);
  const dir = mkdtempSync(join(tmpdir(), 'vgmfix-'));
  try {
    const vgm = join(dir, 'ref.vgm'), wav = join(dir, 'ref.wav');
    execFileSync(FURNACE, ['-loops', '0', '-vgmout', vgm, song], { stdio: 'ignore' });
    execFileSync(FURNACE, ['-loops', '0', '-outformat', 'f32', '-output', wav, song], { stdio: 'ignore' });
    const frames = parseVgm(new Uint8Array(readFileSync(vgm)), seconds);
    const chips: Partial<Record<ChipKind, ChipStream>> = {};
    for (const kind of Object.keys(frames) as ChipKind[]) {
      const f = frames[kind];
      if (f.length) chips[kind] = { frame0: f[0].flat(), writes: f.slice(1).flat(2) };
    }
    const view = execFileSync(FURNACE, ['-output', '/dev/null', '-loops', '0', '-view', 'commands', song], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const commandTicks = seconds * 50;
    const commands = parseCommandView(view, commandTicks);
    const fixture: RegisterFixture = { song, seconds, chips, reference: wavLevel(new Uint8Array(readFileSync(wav)), seconds), commands, commandTicks };
    writeFileSync(out, JSON.stringify(fixture) + '\n');
    console.log(`${basename(song)}: ${Object.entries(chips).map(([k, c]) => `${k} ${c!.writes.length / 2} writes`).join(', ')}; reference ${JSON.stringify(fixture.reference)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('vgm-register-fixture.ts')) main();
