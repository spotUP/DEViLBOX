/** Shared Mesen2 headless runner for the NES player checks (Phase 3 onward). Cycle position is never compared, only (order, address, value) per NMI tick. */
import { expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const MESEN = join(homedir(), 'Applications/Mesen.app/Contents/MacOS/Mesen');
const META = join(__dirname, '../../../../public/nes/player.json');

/** CPU write ranges logged by default: the APU. Chip checks pass the expansion ports as well. */
export const APU_RANGES: ReadonlyArray<[number, number]> = [[0x4000, 0x4017]];

/** Runs rom in Mesen2 headless for `ticks` NMIs. Returns the $4000-$4017 writes per tick and, per tick, the byte at $C000 (DPCM window). */
export function mesen(rom: Uint8Array, ticks: number, timeout = 30, ranges: ReadonlyArray<[number, number]> = APU_RANGES): { writes: Array<Array<[number, number]>>; window: number[] } {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'nesplayer-'));
  try {
    writeFileSync(join(dir, 'p.nes'), rom);
    const lua = `local n=0
${ranges.map(([lo, hi]) => `emu.addMemoryCallback(function(a,v) print(string.format("W %04X %02X",a,v&0xFF)) end, emu.callbackType.write, ${lo}, ${hi})`).join('\n')}
emu.addMemoryCallback(function() n=n+1 print(string.format("T %02X",emu.read(0xC000, emu.memType.nesMemory))) if n>=${ticks + 1} then print("DONE") emu.stop(0) end end, emu.callbackType.exec, ${meta.nmiAddress}, ${meta.nmiAddress})
`;
    writeFileSync(join(dir, 'log.lua'), lua);
    const set = join(homedir(), 'Library/Application Support/Mesen2');
    mkdirSync(set, { recursive: true });
    if (!existsSync(join(set, 'Settings.json'))) writeFileSync(join(set, 'Settings.json'), '{"FirstRun":false}');
    const out = execFileSync(MESEN, ['--testRunner', `--timeout=${timeout}`, '--doNotSaveSettings', '--enableStdout', join(dir, 'log.lua'), join(dir, 'p.nes')], { encoding: 'utf8', timeout: timeout * 1000 + 30000, maxBuffer: 1 << 28 });
    expect(out).toContain('DONE');
    const writes: Array<Array<[number, number]>> = [];
    const window: number[] = [];
    for (const line of out.split('\n')) {
      if (line.startsWith('T ')) { writes.push([]); window.push(parseInt(line.slice(2), 16)); }
      else if (line.startsWith('W ') && writes.length) { const [, a, v] = line.trim().split(' '); writes[writes.length - 1].push([parseInt(a, 16), parseInt(v, 16)]); }
    }
    return { writes: writes.slice(0, ticks), window: window.slice(0, ticks) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

