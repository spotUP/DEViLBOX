/** Shared Mesen2 headless runner for the NES player checks (Phase 3 onward). Cycle position is never compared, only (order, address, value) per NMI tick. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const MESEN = join(homedir(), 'Applications/Mesen.app/Contents/MacOS/Mesen');
const META = join(import.meta.dirname, '../../../../public/nes/player.json');

/** CPU write ranges logged by default: the APU. Chip checks pass the expansion ports as well. */
export const APU_RANGES: ReadonlyArray<[number, number]> = [[0x4000, 0x4013], [0x4015, 0x4015], [0x4017, 0x4017]]; // $4014 (OAM DMA) and $4016 (joypad strobe) belong to the screen, not the music;

/** Runs rom in Mesen2 headless for `ticks` NMIs. Returns the $4000-$4017 writes per tick and, per tick, the byte at $C000 (DPCM window). */
export function mesen(rom: Uint8Array, ticks: number, timeout = 30, ranges: ReadonlyArray<[number, number]> = APU_RANGES, opts: { region?: 'Ntsc' | 'Pal' | 'Dendy'; tickAddress?: number; irqBoard?: boolean; stamps?: boolean; fileName?: string } = {}): { writes: Array<Array<[number, number]>>; window: number[]; cycles: number[]; writeCycles: number[][] } {
  const meta = JSON.parse(readFileSync(META, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'nesplayer-'));
  const tick = opts.tickAddress ?? meta.nmiAddress;
  try {
    writeFileSync(join(dir, opts.fileName ?? 'p.nes'), rom);
    // The custom board's cycle IRQ ($4100-$4103) is modelled by no emulator: count CPU cycles here and, from the player's idle loop, enter the IRQ vector by hand (push PC and P, set I, jump to the handler).
    const board = !opts.irqBoard ? '' : `local per,en,nxt,n=0,false,0,0
emu.addMemoryCallback(function(a,v) if a==0x4100 then per=(per&0xFF00)|v elseif a==0x4101 then per=(per&0xFF)|(v<<8) elseif a==0x4102 then en=(v&1)==1 if en then nxt=emu.getState()["cpu.cycleCount"]+per end end end, emu.callbackType.write, 0x4100, 0x4103)
emu.addMemoryCallback(function() local s=emu.getState() if en and s["cpu.cycleCount"]>=nxt then nxt=nxt+per n=n+1 print(string.format("T %02X %d",emu.read(0xC000, emu.memType.nesMemory),s["cpu.cycleCount"])) if n>=${ticks + 1} then print("DONE") emu.stop(0) end local sp,pc=s["cpu.sp"],s["cpu.pc"] emu.write(0x100+sp,(pc>>8)&0xFF,emu.memType.nesMemory) emu.write(0x100+((sp-1)&0xFF),pc&0xFF,emu.memType.nesMemory) emu.write(0x100+((sp-2)&0xFF),s["cpu.ps"]&0xEF,emu.memType.nesMemory) emu.setState({["cpu.sp"]=(sp-3)&0xFF,["cpu.ps"]=s["cpu.ps"]|4,["cpu.pc"]=${meta.irqAddress}}) end end, emu.callbackType.exec, ${meta.idleAddress}, ${meta.idleAddress})
`;
    const lua = `${board}local n=0
${ranges.map(([lo, hi]) => `emu.addMemoryCallback(function(a,v) print(string.format("W %04X %02X %d",a,v&0xFF,${opts.stamps ? 'emu.getState()["cpu.cycleCount"]' : '0'})) end, emu.callbackType.write, ${lo}, ${hi})`).join('\n')}
${opts.irqBoard ? '' : `emu.addMemoryCallback(function() n=n+1 print(string.format("T %02X %d",emu.read(0xC000, emu.memType.nesMemory),emu.getState()["cpu.cycleCount"])) if n>=${ticks + 1} then print("DONE") emu.stop(0) end end, emu.callbackType.exec, ${tick}, ${tick})`}
`;
    writeFileSync(join(dir, 'log.lua'), lua);
    const set = join(homedir(), 'Library/Application Support/Mesen2');
    mkdirSync(set, { recursive: true });
    if (!existsSync(join(set, 'Settings.json'))) writeFileSync(join(set, 'Settings.json'), '{"FirstRun":false}');
    const out = execFileSync(MESEN, ['--testRunner', `--timeout=${timeout}`, ...(opts.region ? [`--nes.region=${opts.region}`] : []), '--doNotSaveSettings', '--enableStdout', join(dir, 'log.lua'), join(dir, opts.fileName ?? 'p.nes')], { encoding: 'utf8', timeout: timeout * 1000 + 30000, maxBuffer: 1 << 28 });
    if (!out.includes('DONE')) throw new Error('Mesen2 run did not reach DONE: ' + out.slice(-300));
    const writes: Array<Array<[number, number]>> = [];
    const window: number[] = [];
    const cycles: number[] = [];
    const writeCycles: number[][] = [];
    for (const line of out.split('\n')) {
      if (line.startsWith('T ')) { writes.push([]); writeCycles.push([]); const [, w, c] = line.trim().split(' '); window.push(parseInt(w, 16)); cycles.push(Number(c)); }
      else if (line.startsWith('W ') && writes.length) { const [, a, v, c] = line.trim().split(' '); writes[writes.length - 1].push([parseInt(a, 16), parseInt(v, 16)]); writeCycles[writeCycles.length - 1].push(Number(c)); }
    }
    return { writes: writes.slice(0, ticks), window: window.slice(0, ticks), cycles: cycles.slice(0, ticks + 1), writeCycles: writeCycles.slice(0, ticks) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}


export type BusWrite = [number, number];

/** Capture address -> the bus writes the player must make (VRC7 / N163 / 5B capture register numbers, not bus addresses). */
export function busWrites(chip: string, a: number, v: number): BusWrite[] {
  switch (chip) {
    case 'vrc7': return [[0x9010, a], [0x9030, v]];
    case 'n163': return [[0xf800, a | 0x80], [0x4800, v]];
    case 's5b': return [[0xc000, a], [0xe000, v]];
    default: return [[a, v]];
  }
}

/** Per-tick (order, address, value) diff of wanted vs logged bus writes; `first` describes the first mismatch. */
export function diffWrites(want: BusWrite[][], got: BusWrite[][]): { diffs: number; first?: string } {
  let diffs = 0, first: string | undefined;
  const hex = (w?: BusWrite) => (w ? w.map((n) => n.toString(16)).join(':') : 'none');
  for (let t = 0; t < Math.max(want.length, got.length); t++) {
    const a = want[t] ?? [], b = got[t] ?? [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]?.[0] === b[i]?.[0] && a[i]?.[1] === b[i]?.[1]) continue;
      diffs++;
      first ??= `tick ${t} write ${i}: want ${hex(a[i])} got ${hex(b[i])}`;
    }
  }
  return { diffs, first };
}
