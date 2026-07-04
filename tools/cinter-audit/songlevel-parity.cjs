// songlevel-parity.cjs — Cinter .cinter4 song-level lock-test COMPARATOR (task C).
//
// Runs both per-tick Paula traces and diffs them tick-by-tick, per channel:
//   reference = the REAL Cinter4.S in the Moira 68k core  (moira-reference.cjs)
//   devilbox  = the transpiled cinter4.c WASM             (devilbox-trace.cjs)
// A divergence means the transpiled sequencer (CinterPlay1/2) does not match the
// real Amiga player — a bug to fix in cinter4.c.
//
//   MOIRA_JS=/path/to/moira.js \
//   node tools/cinter-audit/songlevel-parity.cjs <song.cinter4> [ticks]
//
// Compares period, volume, sample-offset (identical instrument layout both sides)
// and DMACON. Reports the first divergence per (channel, field) plus totals.

const { execFileSync } = require('child_process');
const path = require('path');

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [songPath, ticksArg] = positional;
const TICKS = ticksArg || '200';
if (!songPath) { console.error('usage: songlevel-parity.cjs <song.cinter4> [ticks]'); process.exit(2); }

const run = (script) => {
  const out = execFileSync('node', [path.join(__dirname, script), songPath, TICKS, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] });
  // The Moira build prints WATCHPOINT noise to stdout before the JSON — take the last line.
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  return JSON.parse(line);
};

const ref = run('moira-reference.cjs');
const dev = run('devilbox-trace.cjs');
const n = Math.min(ref.rows.length, dev.rows.length);

const FIELDS = ['period', 'volume', 'sampleOff'];
const firstDiff = {}; // "ch.field" -> tick
let diffTicks = 0, dmaconDiffs = 0;

for (let t = 0; t < n; t++) {
  const r = ref.rows[t], d = dev.rows[t];
  let tickDiverged = false;
  if ((r.dmacon & 0xffff) !== (d.dmacon & 0xffff)) { dmaconDiffs++; tickDiverged = true; if (firstDiff['dmacon'] === undefined) firstDiff['dmacon'] = t; }
  for (let c = 0; c < 4; c++) {
    // Skip idle channels — a channel neither side is driving (period 0) has stale/
    // sentinel register values (the two model "nothing" differently); comparing them
    // is noise, not a sequencer divergence.
    if ((r.ch[c].period | 0) === 0 && (d.ch[c].period | 0) === 0) continue;
    for (const f of FIELDS) {
      if ((r.ch[c][f] | 0) !== (d.ch[c][f] | 0)) {
        const key = `c${c}.${f}`;
        if (firstDiff[key] === undefined) firstDiff[key] = t;
        tickDiverged = true;
      }
    }
  }
  if (tickDiverged) diffTicks++;
}

console.log(`# song-level lock-test — ${path.basename(songPath)} — ${n} ticks compared`);
console.log(`reference instruments=${ref.instruments}`);
console.log(`diverging ticks: ${diffTicks}/${n}  (dmacon diffs: ${dmaconDiffs})`);
const keys = Object.keys(firstDiff).sort();
if (keys.length === 0) {
  console.log('MATCH — every tick identical.');
} else {
  console.log('first divergence per field:');
  for (const k of keys) {
    const t = firstDiff[k];
    const detail = k === 'dmacon'
      ? `ref=0x${(ref.rows[t].dmacon & 0xffff).toString(16)} dev=0x${(dev.rows[t].dmacon & 0xffff).toString(16)}`
      : (() => { const [cc, f] = k.split('.'); const c = +cc.slice(1); return `ref=${ref.rows[t].ch[c][f]} dev=${dev.rows[t].ch[c][f]}`; })();
    console.log(`  ${k.padEnd(12)} @ tick ${String(t).padStart(4)}  ${detail}`);
  }
}
