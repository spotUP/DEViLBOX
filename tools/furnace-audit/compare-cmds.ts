/**
 * Lock-step command log comparator for Furnace playback debugging.
 *
 * Compares dispatch commands from upstream Furnace CLI (-view commands)
 * against DEViLBOX WASM sequencer (--cmdlog) tick-by-tick.
 *
 * Usage:
 *   npx tsx tools/furnace-audit/compare-cmds.ts <ref-cmds.txt> <dvb-cmdlog.txt>
 *   npx tsx tools/furnace-audit/compare-cmds.ts --song <path/to/song.fur>
 *
 * The --song mode automatically renders both and compares.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// DivCommand enum names (matching dispatch.h order)
const CMD_NAMES: Record<number, string> = {
  0: 'NOTE_ON', 1: 'NOTE_OFF', 2: 'NOTE_OFF_ENV', 3: 'ENV_RELEASE',
  4: 'INSTRUMENT', 5: 'VOLUME', 6: 'GET_VOLUME', 7: 'GET_VOLMAX',
  8: 'NOTE_PORTA', 9: 'PITCH', 10: 'PANNING', 11: 'LEGATO',
  12: 'PRE_PORTA', 13: 'PRE_NOTE',
  14: 'HINT_VIBRATO', 15: 'HINT_VIBRATO_RANGE', 16: 'HINT_VIBRATO_SHAPE',
  17: 'HINT_PITCH', 18: 'HINT_ARPEGGIO', 19: 'HINT_VOLUME',
  20: 'HINT_VOL_SLIDE', 21: 'HINT_PORTA', 22: 'HINT_LEGATO',
  23: 'HINT_VOL_SLIDE_TARGET', 24: 'HINT_TREMOLO', 25: 'HINT_PANBRELLO',
  26: 'HINT_PAN_SLIDE', 27: 'HINT_PANNING',
  28: 'SAMPLE_MODE', 29: 'SAMPLE_FREQ', 30: 'SAMPLE_BANK',
  31: 'SAMPLE_POS', 32: 'SAMPLE_DIR',
  33: 'FM_HARD_RESET',
};

interface CmdEntry {
  tick: number;
  chan: number;
  cmd: string;
  val1: number;
  val2: number;
}

// Parse upstream Furnace CLI command log (-view commands)
// Format: "       0 | 0: NOTE_ON(53, 15)"
function parseRefLog(text: string): CmdEntry[] {
  const entries: CmdEntry[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\s*\|\s*(\d+):\s*(\w+)\((-?\d+),\s*(-?\d+)\)/);
    if (m) {
      entries.push({
        tick: parseInt(m[1]),
        chan: parseInt(m[2]),
        cmd: m[3],
        val1: parseInt(m[4]),
        val2: parseInt(m[5]),
      });
    }
  }
  return entries;
}

// Parse DEViLBOX WASM command log (--cmdlog)
// Format: "tick\tcmd\tchan\tval1\tval2\tret"
function parseDvbLog(text: string): CmdEntry[] {
  const entries: CmdEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    const cmdNum = parseInt(parts[1]);
    entries.push({
      tick: parseInt(parts[0]),
      chan: parseInt(parts[2]),
      cmd: CMD_NAMES[cmdNum] || `CMD_${cmdNum}`,
      val1: parseInt(parts[3]),
      val2: parseInt(parts[4]),
    });
  }
  return entries;
}

// Filter out non-comparable commands (GET_VOLUME, GET_VOLMAX are queries not actions)
// Also filter HINT_* commands since upstream strips some of them in -view commands mode
function filterComparable(entries: CmdEntry[]): CmdEntry[] {
  return entries.filter(e =>
    !e.cmd.startsWith('GET_') &&
    !e.cmd.startsWith('HINT_') &&
    e.cmd !== 'PRE_PORTA' &&
    e.cmd !== 'PRE_NOTE'
  );
}

function compare(refEntries: CmdEntry[], dvbEntries: CmdEntry[], maxDiffs: number = 20): void {
  const ref = filterComparable(refEntries);
  const dvb = filterComparable(dvbEntries);

  console.log(`Reference: ${refEntries.length} total, ${ref.length} comparable commands`);
  console.log(`DEViLBOX:  ${dvbEntries.length} total, ${dvb.length} comparable commands`);
  console.log('');

  // Group by tick for lock-step comparison
  const refByTick = new Map<number, CmdEntry[]>();
  const dvbByTick = new Map<number, CmdEntry[]>();
  for (const e of ref) {
    if (!refByTick.has(e.tick)) refByTick.set(e.tick, []);
    refByTick.get(e.tick)!.push(e);
  }
  for (const e of dvb) {
    if (!dvbByTick.has(e.tick)) dvbByTick.set(e.tick, []);
    dvbByTick.get(e.tick)!.push(e);
  }

  const allTicks = new Set([...refByTick.keys(), ...dvbByTick.keys()]);
  const sortedTicks = [...allTicks].sort((a, b) => a - b);

  let diffs = 0;
  let matchedTicks = 0;
  let totalTicks = sortedTicks.length;

  for (const tick of sortedTicks) {
    const rCmds = refByTick.get(tick) || [];
    const dCmds = dvbByTick.get(tick) || [];

    // Compare commands at this tick
    const maxLen = Math.max(rCmds.length, dCmds.length);
    let tickMatch = true;

    for (let i = 0; i < maxLen; i++) {
      const r = rCmds[i];
      const d = dCmds[i];

      if (!r && d) {
        if (diffs < maxDiffs) {
          console.log(`EXTRA DVB  tick=${tick} ch=${d.chan}: ${d.cmd}(${d.val1}, ${d.val2})`);
        }
        tickMatch = false;
        diffs++;
      } else if (r && !d) {
        if (diffs < maxDiffs) {
          console.log(`MISSING    tick=${tick} ch=${r.chan}: ${r.cmd}(${r.val1}, ${r.val2})`);
        }
        tickMatch = false;
        diffs++;
      } else if (r && d) {
        if (r.cmd !== d.cmd || r.chan !== d.chan || r.val1 !== d.val1 || r.val2 !== d.val2) {
          if (diffs < maxDiffs) {
            console.log(`MISMATCH   tick=${tick}`);
            console.log(`  REF: ch=${r.chan} ${r.cmd}(${r.val1}, ${r.val2})`);
            console.log(`  DVB: ch=${d.chan} ${d.cmd}(${d.val1}, ${d.val2})`);
          }
          tickMatch = false;
          diffs++;
        }
      }
    }

    if (tickMatch) matchedTicks++;
  }

  console.log('');
  console.log(`${matchedTicks}/${totalTicks} ticks match perfectly`);
  console.log(`${diffs} differences found${diffs > maxDiffs ? ` (showing first ${maxDiffs})` : ''}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--song' && args[1]) {
    // Auto mode: render both and compare
    const furPath = args[1];
    if (!existsSync(furPath)) {
      console.error(`File not found: ${furPath}`);
      process.exit(1);
    }

    console.log(`Lock-step comparing: ${furPath}`);
    console.log('');

    // Generate reference command log
    console.log('Rendering reference (Furnace CLI)...');
    const refOutput = execSync(
      `"/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace" -output /dev/null -loops 0 -view commands "${furPath}" 2>/dev/null`,
      { maxBuffer: 100 * 1024 * 1024, timeout: 300000 }
    ).toString();
    const refEntries = parseRefLog(refOutput);
    console.log(`  ${refEntries.length} commands captured`);

    // Generate DEViLBOX command log
    console.log('Rendering DEViLBOX (WASM headless)...');
    execSync(
      `npx tsx tools/furnace-audit/render-devilbox.ts "${furPath}" /dev/null --cmdlog 2>/dev/null`,
      { maxBuffer: 100 * 1024 * 1024, timeout: 300000 }
    );

    // Find the cmdlog file
    const cmdlogPath = furPath.replace(/\.fur$/, '') + '.cmdlog.txt';
    const altPath = '/dev/null.cmdlog.txt';
    let dvbText = '';
    if (existsSync(cmdlogPath)) {
      dvbText = readFileSync(cmdlogPath, 'utf8');
    } else if (existsSync(altPath)) {
      dvbText = readFileSync(altPath, 'utf8');
    } else {
      // Check /tmp
      const tmpLog = '/tmp/furnace-compare/cmdlog.txt';
      console.error('Could not find DEViLBOX command log. Use --cmdlog flag.');
      process.exit(1);
    }

    const dvbEntries = parseDvbLog(dvbText);
    console.log(`  ${dvbEntries.length} commands captured`);
    console.log('');

    compare(refEntries, dvbEntries);
  } else if (args.length >= 2) {
    // Manual mode: compare two files
    const refText = readFileSync(args[0], 'utf8');
    const dvbText = readFileSync(args[1], 'utf8');

    // Auto-detect format
    const refEntries = refText.includes('|') ? parseRefLog(refText) : parseDvbLog(refText);
    const dvbEntries = dvbText.includes('|') ? parseRefLog(dvbText) : parseDvbLog(dvbText);

    compare(refEntries, dvbEntries);
  } else {
    console.log('Usage:');
    console.log('  npx tsx tools/furnace-audit/compare-cmds.ts --song <path/to/song.fur>');
    console.log('  npx tsx tools/furnace-audit/compare-cmds.ts <ref-cmds.txt> <dvb-cmdlog.txt>');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
