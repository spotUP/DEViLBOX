// moira-reference.cjs — song-level lock-test REFERENCE (task C).
//
// Runs the REAL Amiga Cinter4.S player in the Moira 68k WASM core and captures the
// ground-truth Paula register state per 50 Hz tick — period / volume / instrument /
// sample-offset / DMACON per channel. This is the independent reference to diff the
// transpiled cinter4.c (DEViLBOX WASM) against; diffing cinter4.c vs itself proves
// nothing, so a genuine 68k execution of Cinter4.S is required.
//
//   # 1. build the reference blob (once):
//   tools/cinter-audit/build-cinter-reference.sh
//   # 2. run (Moira core comes from the amiexpress-web project):
//   MOIRA_JS=/path/to/amiga-emulation/cpu/build/moira.js \
//   node tools/cinter-audit/moira-reference.cjs <song.cinter4> [ticks] [--json]
//
// How it works: Cinter4.S assembles to a 750-byte blob (build-cinter-reference.sh)
// with entry offsets CinterInit@0x0, CinterPlay1@0x1D8, CinterPlay2@0x22C. We lay
// code / working mem / music / a 2 MB instrument space / stack in Moira's flat 16 MB
// space, set A2=music A4=inst A6=work, call CinterInit (synthesizes instruments),
// then per tick call CinterPlay1 then CinterPlay2 and read the Paula audio registers
// ($dff0a0 + ch*0x10) + DMACON ($dff096). Subroutines are called by pushing a
// sentinel return address and running (native executeUntilTrap) until the RTS lands
// on it.
//
// Two Amiga-hardware details are neutralized (timing-only, not register values): the
// `.dmawait` raster spin ($dff006 never advances in flat RAM) is NOP'd, and
// `bset.b #1,$bfe001` (audio filter LED) is a harmless RAM write.
//
// KEY: after setting PC via setRegister, call refillPrefetch() — else the CPU runs
// the stale prefetch queue (fetched before the code was loaded) and diverges.

const fs = require('fs');
const path = require('path');

const MOIRA_JS = process.env.MOIRA_JS
  || '/Users/spot/Code/amiexpress-web/web/backend/src/amiga-emulation/cpu/build/moira.js';
const REF_DIR = process.env.CINTER_REF_DIR || path.join(__dirname, 'reference');

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [songPath, ticksArg] = positional;
const asJson = process.argv.includes('--json');
const TICKS = ticksArg ? parseInt(ticksArg, 10) : 200;

if (!songPath) { console.error('usage: moira-reference.cjs <song.cinter4> [ticks] [--json]'); process.exit(2); }

// Memory map in Moira's flat 16 MB (Chip 0-0x1FFFFF, Fast 0x200000-0xF7FFFF).
const CODE = 0x2000, WORK = 0x100000, MUSIC = 0x200000, INST = 0x400000;
const STACK = 0x0F0000, SENT = 0x00FFFE, DFF = 0xDFF000;
// Entry offsets (build-cinter-reference.sh symbol map) + the .dmawait bgt to NOP.
const CINTER_INIT = 0x0, CINTER_PLAY1 = 0x1D8, CINTER_PLAY2 = 0x22C, DMAWAIT_BGT = 0x2E6;

(async () => {
  const createMoira = require(MOIRA_JS);
  const M = await createMoira();
  const cpu = new M.MoiraCPU(16 * 1024 * 1024);

  const code = new Uint8Array(fs.readFileSync(path.join(REF_DIR, 'Cinter4.bin')));
  const music = new Uint8Array(fs.readFileSync(songPath));

  const w32 = (a, v) => { for (let i = 0; i < 4; i++) cpu.setMemoryByte(a + i, (v >>> (24 - i * 8)) & 255); };
  const rdw = (a) => (cpu.getMemoryByte(a) << 8) | cpu.getMemoryByte(a + 1);
  const rdl = (a) => ((cpu.getMemoryByte(a) << 24) | (cpu.getMemoryByte(a + 1) << 16)
    | (cpu.getMemoryByte(a + 2) << 8) | cpu.getMemoryByte(a + 3)) >>> 0;
  const pc = () => cpu.getRegister(16) >>> 0; // regs: D0-7=0-7, A0-7=8-15, PC=16

  for (let i = 0; i < code.length; i++) cpu.setMemoryByte(CODE + i, code[i]);
  cpu.setMemoryByte(CODE + DMAWAIT_BGT, 0x4E); cpu.setMemoryByte(CODE + DMAWAIT_BGT + 1, 0x71); // bgt -> NOP
  for (let i = 0; i < music.length; i++) cpu.setMemoryByte(MUSIC + i, music[i]);

  w32(0, STACK); w32(4, CODE); cpu.resetCPU();
  if (cpu.clearTrapAddresses) cpu.clearTrapAddresses();
  cpu.addTrapAddress(SENT);

  // Call a Cinter subroutine: push the sentinel return addr, run until the RTS trips
  // the trap on SENT. Returns false if it never returns within the budget.
  const call = (entryOff) => {
    w32(STACK - 4, SENT);
    cpu.setRegister(15, STACK - 4);        // SP
    cpu.setRegister(16, CODE + entryOff);  // PC
    cpu.refillPrefetch();                  // MUST — flush stale prefetch
    let guard = 0;
    while (pc() !== SENT && guard++ < 60) cpu.executeUntilTrap(20_000_000);
    return pc() === SENT;
  };

  cpu.setRegister(10, MUSIC); cpu.setRegister(12, INST); cpu.setRegister(14, WORK); // A2/A4/A6
  if (!call(CINTER_INIT)) { console.error('CinterInit did not return'); process.exit(1); }

  // Instrument table (c_Instruments @ work+156: 32 × [len:replen long, ptr long]).
  const insts = [];
  for (let k = 0; k < 32; k++) {
    const b = WORK + 156 + k * 8;
    const len = rdw(b), ptr = rdl(b + 4);
    if (len === 0 && ptr === 0) break;
    insts.push({ lo: ptr - INST, hi: ptr - INST + len * 2 });
  }
  const instOf = (off) => { for (let k = 0; k < insts.length; k++) if (off >= insts[k].lo && off < insts[k].hi) return k; return -1; };

  const rows = [];
  for (let t = 0; t < TICKS; t++) {
    if (!call(CINTER_PLAY1)) { console.error(`tick ${t}: CinterPlay1 did not return`); break; }
    if (!call(CINTER_PLAY2)) { console.error(`tick ${t}: CinterPlay2 did not return`); break; }
    const dmacon = rdw(DFF + 0x096);
    const ch = [];
    for (let c = 0; c < 4; c++) {
      const b = DFF + 0x0A0 + c * 0x10;
      const off = (rdl(b) - INST) >>> 0;
      ch.push({ period: rdw(b + 6), volume: rdw(b + 8), inst: instOf(off), sampleOff: off, len: rdw(b + 4) });
    }
    rows.push({ tick: t, dmacon, ch });
  }

  if (asJson) { console.log(JSON.stringify({ song: path.basename(songPath), instruments: insts.length, rows })); return; }
  console.log(`# Cinter4.S reference (Moira) — ${path.basename(songPath)} — ${insts.length} instruments, ${rows.length} ticks`);
  for (const r of rows) {
    let line = `T${String(r.tick).padStart(4)} dmacon=0x${r.dmacon.toString(16).padStart(4, '0')}`;
    for (let c = 0; c < 4; c++) line += `  c${c}[per=${r.ch[c].period} vol=${r.ch[c].volume} inst=${r.ch[c].inst}]`;
    console.log(line);
  }
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
