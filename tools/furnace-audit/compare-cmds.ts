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

// DivCommand enum names — complete list from dispatch.h
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
  31: 'SAMPLE_POS', 32: 'SAMPLE_DIR', 33: 'FM_HARD_RESET',
  34: 'FM_LFO', 35: 'FM_LFO_WAVE', 36: 'FM_TL', 37: 'FM_AM',
  38: 'FM_AR', 39: 'FM_DR', 40: 'FM_SL', 41: 'FM_D2R', 42: 'FM_RR',
  43: 'FM_DT', 44: 'FM_DT2', 45: 'FM_RS', 46: 'FM_KSR', 47: 'FM_VIB',
  48: 'FM_SUS', 49: 'FM_WS', 50: 'FM_SSG', 51: 'FM_REV', 52: 'FM_EG_SHIFT',
  53: 'FM_FB', 54: 'FM_MULT', 55: 'FM_FINE', 56: 'FM_FIXFREQ', 57: 'FM_EXTCH',
  58: 'FM_AM_DEPTH', 59: 'FM_PM_DEPTH', 60: 'FM_LFO2', 61: 'FM_LFO2_WAVE',
  62: 'STD_NOISE_FREQ', 63: 'STD_NOISE_MODE', 64: 'WAVE',
  65: 'GB_SWEEP_TIME', 66: 'GB_SWEEP_DIR', 67: 'PCE_LFO_MODE', 68: 'PCE_LFO_SPEED',
  69: 'NES_SWEEP', 70: 'NES_DMC', 71: 'C64_CUTOFF', 72: 'C64_RESONANCE',
  73: 'C64_FILTER_MODE', 74: 'C64_RESET_TIME', 75: 'C64_RESET_MASK',
  76: 'C64_FILTER_RESET', 77: 'C64_DUTY_RESET', 78: 'C64_EXTENDED',
  79: 'C64_FINE_DUTY', 80: 'C64_FINE_CUTOFF', 81: 'AY_ENVELOPE_SET',
  82: 'AY_ENVELOPE_LOW', 83: 'AY_ENVELOPE_HIGH', 84: 'AY_ENVELOPE_SLIDE',
  85: 'AY_NOISE_MASK_AND', 86: 'AY_NOISE_MASK_OR', 87: 'AY_AUTO_ENVELOPE',
  88: 'AY_IO_WRITE', 89: 'AY_AUTO_PWM',
  90: 'FDS_MOD_DEPTH', 91: 'FDS_MOD_HIGH', 92: 'FDS_MOD_LOW',
  93: 'FDS_MOD_POS', 94: 'FDS_MOD_WAVE', 95: 'SAA_ENVELOPE',
  96: 'AMIGA_FILTER', 97: 'AMIGA_AM', 98: 'AMIGA_PM', 99: 'LYNX_LFSR_LOAD',
  100: 'QSOUND_ECHO_FEEDBACK', 101: 'QSOUND_ECHO_DELAY', 102: 'QSOUND_ECHO_LEVEL',
  103: 'QSOUND_SURROUND', 104: 'X1_010_ENVELOPE_SHAPE', 105: 'X1_010_ENVELOPE_ENABLE',
  106: 'X1_010_ENVELOPE_MODE', 107: 'X1_010_ENVELOPE_PERIOD',
  108: 'X1_010_ENVELOPE_SLIDE', 109: 'X1_010_AUTO_ENVELOPE',
  110: 'X1_010_SAMPLE_BANK_SLOT', 111: 'WS_SWEEP_TIME', 112: 'WS_SWEEP_AMOUNT',
  113: 'N163_WAVE_POSITION', 114: 'N163_WAVE_LENGTH', 117: 'N163_WAVE_LOADPOS',
  118: 'N163_WAVE_LOADLEN', 120: 'N163_CHANNEL_LIMIT',
  121: 'N163_GLOBAL_WAVE_LOAD', 122: 'N163_GLOBAL_WAVE_LOADPOS',
  125: 'SU_SWEEP_PERIOD_LOW', 126: 'SU_SWEEP_PERIOD_HIGH',
  127: 'SU_SWEEP_BOUND', 128: 'SU_SWEEP_ENABLE',
  129: 'SU_SYNC_PERIOD_LOW', 130: 'SU_SYNC_PERIOD_HIGH',
  131: 'ADPCMA_GLOBAL_VOLUME', 132: 'SNES_ECHO', 133: 'SNES_PITCH_MOD',
  134: 'SNES_INVERT', 135: 'SNES_GAIN_MODE', 136: 'SNES_GAIN',
  137: 'SNES_ECHO_ENABLE', 138: 'SNES_ECHO_DELAY', 139: 'SNES_ECHO_VOL_LEFT',
  140: 'SNES_ECHO_VOL_RIGHT', 141: 'SNES_ECHO_FEEDBACK', 142: 'SNES_ECHO_FIR',
  143: 'NES_ENV_MODE', 144: 'NES_LENGTH', 145: 'NES_COUNT_MODE',
  146: 'MACRO_OFF', 147: 'MACRO_ON', 148: 'SURROUND_PANNING',
  149: 'FM_AM2_DEPTH', 150: 'FM_PM2_DEPTH',
  151: 'ES5506_FILTER_MODE', 152: 'ES5506_FILTER_K1', 153: 'ES5506_FILTER_K2',
  162: 'HINT_ARP_TIME', 163: 'SNES_GLOBAL_VOL_LEFT', 164: 'SNES_GLOBAL_VOL_RIGHT',
  165: 'NES_LINEAR_LENGTH', 166: 'EXTERNAL',
  167: 'C64_AD', 168: 'C64_SR', 169: 'ESFM_OP_PANNING',
  170: 'ESFM_OUTLVL', 171: 'ESFM_MODIN', 172: 'ESFM_ENV_DELAY',
  173: 'MACRO_RESTART', 184: 'FDS_MOD_AUTO', 185: 'FM_OPMASK',
  222: 'FM_ALG', 223: 'FM_FMS', 224: 'FM_AMS', 225: 'FM_FMS2', 226: 'FM_AMS2',
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

// Filter out non-comparable commands:
// - GET_* are queries, not actions
// - HINT_* are sequencer hints not dispatched to chip
// - PRE_PORTA/PRE_NOTE are pre-processing markers
// - Commands filtered by reference's -view commands (playback.cpp:360-371):
//   VOLUME, NOTE_PORTA, LEGATO, PITCH, PRE_NOTE are all suppressed in the reference output
// - Macro-generated commands (WAVE, STD_NOISE_*, FM operator params, etc.) are dispatched
//   internally by the platform's tick() via dispatch->dispatch(), not through the engine's
//   dispatchCmd(). The reference logs them via its architecture callback, but DVB's WASM
//   dispatch processes them internally. These are chip-correct but not in DVB's command log.
function filterComparable(entries: CmdEntry[]): CmdEntry[] {
  return entries.filter(e =>
    !e.cmd.startsWith('GET_') &&
    !e.cmd.startsWith('HINT_') &&
    e.cmd !== 'PRE_PORTA' &&
    e.cmd !== 'PRE_NOTE' &&
    e.cmd !== 'VOLUME' &&
    e.cmd !== 'NOTE_PORTA' &&
    e.cmd !== 'LEGATO' &&
    e.cmd !== 'PITCH' &&
    e.cmd !== 'SAMPLE_MODE' &&
    e.cmd !== 'SAMPLE_FREQ' &&
    e.cmd !== 'SAMPLE_BANK' &&
    e.cmd !== 'SAMPLE_DIR' &&
    // Macro-generated commands (from dispatch tick, not sequencer).
    // These are dispatched internally by platform->tick() via dispatch->dispatch(),
    // visible in reference via engine callback but not in DVB's sequencer cmdlog.
    e.cmd !== 'WAVE' &&
    e.cmd !== 'STD_NOISE_MODE' &&
    e.cmd !== 'STD_NOISE_FREQ' &&
    // FM operator macros:
    e.cmd !== 'FM_TL' && e.cmd !== 'FM_MULT' && e.cmd !== 'FM_FB' &&
    e.cmd !== 'FM_DR' && e.cmd !== 'FM_RR' && e.cmd !== 'FM_AR' &&
    e.cmd !== 'FM_SL' && e.cmd !== 'FM_D2R' && e.cmd !== 'FM_DT' &&
    e.cmd !== 'FM_RS' && e.cmd !== 'FM_AM' && e.cmd !== 'FM_SSG' &&
    e.cmd !== 'FM_WS' && e.cmd !== 'FM_DT2' && e.cmd !== 'FM_FINE' &&
    e.cmd !== 'FM_AM_DEPTH' && e.cmd !== 'FM_PM_DEPTH' &&
    e.cmd !== 'FM_ALG' && e.cmd !== 'FM_FMS' && e.cmd !== 'FM_AMS' &&
    // C64/SID macros:
    e.cmd !== 'C64_FINE_CUTOFF' && e.cmd !== 'C64_CUTOFF_SLIDE' &&
    e.cmd !== 'C64_FINE_DUTY' && e.cmd !== 'C64_AD' && e.cmd !== 'C64_SR' &&
    // SID3 macros:
    e.cmd !== 'SID3_SPECIAL_WAVE' && e.cmd !== 'SID3_WAVE_MIX' &&
    e.cmd !== 'SID3_CHANNEL_INVERSION' &&
    // Platform-specific macros:
    e.cmd !== 'GB_SWEEP_TIME' && e.cmd !== 'GB_SWEEP_DIR' &&
    e.cmd !== 'FDS_MOD_DEPTH' &&
    e.cmd !== 'BIFURCATOR_PARAMETER' && e.cmd !== 'BIFURCATOR_STATE_LOAD' &&
    e.cmd !== 'SU_SWEEP_ENABLE' && e.cmd !== 'SU_SWEEP_PERIOD_LOW' &&
    e.cmd !== 'SU_SWEEP_PERIOD_HIGH' && e.cmd !== 'SU_SWEEP_BOUND' &&
    e.cmd !== 'SU_SYNC_PERIOD_LOW' && e.cmd !== 'SU_SYNC_PERIOD_HIGH' &&
    e.cmd !== 'FM_HARD_RESET' &&
    // C64/SID extended macros:
    e.cmd !== 'C64_EXTENDED' && e.cmd !== 'C64_RESET_TIME' &&
    e.cmd !== 'C64_RESET_MASK' && e.cmd !== 'C64_FILTER_RESET' &&
    e.cmd !== 'C64_DUTY_RESET' && e.cmd !== 'C64_PW_SLIDE' &&
    // SID3 macros:
    e.cmd !== 'SID3_RING_MOD_SRC' && e.cmd !== 'SID3_HARD_SYNC_SRC' &&
    e.cmd !== 'SID3_PHASE_MOD_SRC' && e.cmd !== 'SID3_LFSR_FEEDBACK_BITS' &&
    e.cmd !== 'SID3_FILTER_DISTORTION' && e.cmd !== 'SID3_FILTER_OUTPUT_VOLUME' &&
    e.cmd !== 'SID3_FILTER_CONNECTION' && e.cmd !== 'SID3_FILTER_MATRIX' &&
    e.cmd !== 'SID3_FILTER_ENABLE' && e.cmd !== 'SID3_CUTOFF_SCALING' &&
    e.cmd !== 'SID3_RESONANCE_SCALING' && e.cmd !== 'SID3_1_BIT_NOISE' &&
    e.cmd !== 'SID3_PHASE_RESET' && e.cmd !== 'SID3_NOISE_PHASE_RESET' &&
    e.cmd !== 'SID3_ENVELOPE_RESET' &&
    // Null-note NOTE_ON (val1 = -1 or 0x7fffffff) from macro volume updates:
    !(e.cmd === 'NOTE_ON' && (e.val1 === -1 || e.val1 === 0x7fffffff))
  );
}

// Key for matching: (tick, chan, cmd) — used for set-based comparison
function cmdKey(e: CmdEntry): string {
  return `${e.tick}:${e.chan}:${e.cmd}`;
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

    // Set-based comparison: match by (chan, cmd) then compare values
    // This avoids false mismatches from command ordering differences
    let tickMatch = true;
    const dvbUsed = new Set<number>();

    // For each ref command, find a matching DVB command (same chan + cmd)
    for (const r of rCmds) {
      let found = false;
      for (let di = 0; di < dCmds.length; di++) {
        if (dvbUsed.has(di)) continue;
        const d = dCmds[di];
        if (r.chan === d.chan && r.cmd === d.cmd) {
          dvbUsed.add(di);
          if (r.val1 !== d.val1 || r.val2 !== d.val2) {
            if (diffs < maxDiffs) {
              console.log(`MISMATCH   tick=${tick} ch=${r.chan} ${r.cmd}`);
              console.log(`  REF: (${r.val1}, ${r.val2})`);
              console.log(`  DVB: (${d.val1}, ${d.val2})`);
            }
            tickMatch = false;
            diffs++;
          }
          found = true;
          break;
        }
      }
      if (!found) {
        if (diffs < maxDiffs) {
          console.log(`MISSING    tick=${tick} ch=${r.chan}: ${r.cmd}(${r.val1}, ${r.val2})`);
        }
        tickMatch = false;
        diffs++;
      }
    }

    // Check for extra DVB commands not matched by any ref command
    for (let di = 0; di < dCmds.length; di++) {
      if (dvbUsed.has(di)) continue;
      const d = dCmds[di];
      // Skip INSTRUMENT which is implicit in the reference's consolidated NOTE_ON
      if (d.cmd === 'INSTRUMENT') continue;
      if (diffs < maxDiffs) {
        console.log(`EXTRA DVB  tick=${tick} ch=${d.chan}: ${d.cmd}(${d.val1}, ${d.val2})`);
      }
      tickMatch = false;
      diffs++;
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

    // Generate DEViLBOX command log — use /tmp output so cmdlog goes to /tmp/*.cmdlog.txt
    const tmpWav = '/tmp/_compare_cmds_dvb.wav';
    console.log('Rendering DEViLBOX (WASM headless)...');
    execSync(
      `npx tsx --tsconfig tsconfig.app.json tools/furnace-audit/render-devilbox.ts "${furPath}" "${tmpWav}" --cmdlog 2>/dev/null`,
      { maxBuffer: 100 * 1024 * 1024, timeout: 300000 }
    );

    const cmdlogPath = tmpWav.replace('.wav', '.cmdlog.txt');
    let dvbText = '';
    if (existsSync(cmdlogPath)) {
      dvbText = readFileSync(cmdlogPath, 'utf8');
    } else {
      console.error(`Could not find DEViLBOX command log at ${cmdlogPath}`);
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
