/**
 * mod-export-compare.ts — Round-trip MOD export comparison test suite
 *
 * Level 1 (always): parse source → exportSongToMOD → parseMODFile → compare fields
 * Level 2 (--audio): render source + exported MOD via openmpt123 → envelopeCorrelation ≥ 0.90
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json tools/mod-export-compare.ts [--audio] [filter]
 */

import { existsSync, mkdirSync, readFileSync, copyFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

import { exportSongToMOD, noteToMODPeriod, TEST_CASES, bakeHivelyInstruments, bakeSidMon1Instruments, bakeGenericSynthInstruments } from './export-songs-openmpt';
import { envelopeCorrelation } from './furnace-audit/compare-wavs';

// ── Note roundtrip prediction ────────────────────────────────────────────────
// Given a source note, predict what note the MOD re-parser will produce after
// round-trip: source note → exportPeriod → periodToNote → noteNameToIndex.
// This handles both Amiga (e.g. Oktalyzer) and XM (e.g. MOD source) conventions.
const NOTE_SEMITONES_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

function noteNameToIndexLocal(name: string): number {
  const match = name.match(/^([A-G]#?)[-]?(\d)$/);
  if (!match) return 0;
  const semitone = NOTE_SEMITONES_MAP[match[1]] ?? 0;
  const octave = parseInt(match[2]);
  return octave * 12 + semitone + 1;
}

/** Exact copy of MODParser.ts periodToNote — find nearest period in table */
function periodToNoteLocal(period: number): string | null {
  if (period === 0) return null;
  const PERIOD_TABLE: Record<number, string> = {
    1712: 'C-0', 1616: 'C#0', 1525: 'D-0', 1440: 'D#0', 1357: 'E-0', 1281: 'F-0',
    1209: 'F#0', 1141: 'G-0', 1077: 'G#0', 1017: 'A-0',  960: 'A#0',  907: 'B-0',
     856: 'C-1',  808: 'C#1',  762: 'D-1',  720: 'D#1',  678: 'E-1',  640: 'F-1',
     604: 'F#1',  570: 'G-1',  538: 'G#1',  508: 'A-1',  480: 'A#1',  453: 'B-1',
     428: 'C-2',  404: 'C#2',  381: 'D-2',  360: 'D#2',  339: 'E-2',  320: 'F-2',
     302: 'F#2',  285: 'G-2',  269: 'G#2',  254: 'A-2',  240: 'A#2',  226: 'B-2',
     214: 'C-3',  202: 'C#3',  190: 'D-3',  180: 'D#3',  170: 'E-3',  160: 'F-3',
     151: 'F#3',  143: 'G-3',  135: 'G#3',  127: 'A-3',  120: 'A#3',  113: 'B-3',
  };
  let closest: string | null = null;
  let minDiff = Infinity;
  for (const [pStr, name] of Object.entries(PERIOD_TABLE)) {
    const diff = Math.abs(parseInt(pStr) - period);
    if (diff < minDiff) { minDiff = diff; closest = name; }
  }
  return minDiff > 100 ? null : closest;
}

/**
 * Predict what note index the MOD parser will produce for a given source note.
 * Pipeline: sourceNote → (noteExportOffset) → exportPeriod → (HivelySynth clamp?) → periodToNote → noteNameToIndex
 * Returns 0 (silence) if the note has no period or maps outside the MOD table.
 * @param srcNote         Original note number
 * @param clampPeriod     If true, apply PT period clamping (used for pure-HivelySynth out-of-range instruments)
 * @param noteExportOffset Semitone offset applied before period lookup (e.g. -60 for S3M-origin GDM)
 */
function predictReparsedNote(srcNote: number, clampPeriod = false, noteExportOffset = 0): number {
  if (srcNote === 0 || srcNote >= 97) return 0;
  const expNote = srcNote + noteExportOffset;
  let period = noteToMODPeriod(expNote);
  if (period === 0) return 0;
  // For HivelySynth instruments exclusively used at out-of-range periods, the exporter
  // resamples the waveform and clamps the period so ProTracker displays a valid note.
  if (clampPeriod) {
    while (period > 856 && period > 0) period = (period + 1) >> 1;
    while (period > 0 && period < 113) period = period << 1;
  }
  const name = periodToNoteLocal(period);
  if (!name) return 0;
  return noteNameToIndexLocal(name);
}

const ROOT     = join(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'public/data/songs/formats');
const TMP_DIR  = join(tmpdir(), 'mod-export-test');
const WAV_DIR  = join(TMP_DIR, 'wav');

const OPENMPT123 = '/opt/homebrew/bin/openmpt123';

// ── CLI args ──────────────────────────────────────────────────────────────────

const cliArgs  = process.argv.slice(2);
const doAudio  = cliArgs.includes('--audio');
const filterArg = cliArgs.find(a => !a.startsWith('--'));

const cases = filterArg
  ? TEST_CASES.filter(tc =>
      tc.file.toLowerCase().includes(filterArg.toLowerCase()) ||
      tc.format.toLowerCase().includes(filterArg.toLowerCase()))
  : TEST_CASES;

mkdirSync(TMP_DIR, { recursive: true });
if (doAudio) mkdirSync(WAV_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStem(file: string): string {
  return basename(file).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_\-. ]/gi, '_');
}

/**
 * Render any tracker format to WAV using openmpt123.
 * openmpt123 --render writes <file>.wav next to the input, so we copy
 * the input into WAV_DIR first, render there, then rename the result.
 * Caller is responsible for deleting outputPath after use (disk space).
 */
function tryDelete(p: string): void {
  try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
}

/**
 * Render a tracker file to WAV via openmpt123.
 * Uses mono 22050 Hz to keep files small (~3 MB / min vs ~20 MB / min stereo 44k).
 * Deletes all temp files even on failure.
 * outputPath is also deleted by the caller after use.
 */
function renderWav(inputPath: string, outputPath: string): boolean {
  if (!existsSync(OPENMPT123)) return false;
  const tmpInput   = join(WAV_DIR, basename(inputPath));
  const renderedAt = tmpInput + '.wav';
  tryDelete(tmpInput);
  tryDelete(renderedAt);
  tryDelete(outputPath);
  try {
    copyFileSync(inputPath, tmpInput);
    execSync(
      `"${OPENMPT123}" --quiet --render --output-type wav --channels 1 --samplerate 22050 "${tmpInput}"`,
      { stdio: 'pipe', timeout: 120_000 }
    );
    if (!existsSync(renderedAt)) return false;
    copyFileSync(renderedAt, outputPath);
    return true;
  } catch {
    return false;
  } finally {
    tryDelete(tmpInput);
    tryDelete(renderedAt);
  }
}

function deleteWav(path: string): void { tryDelete(path); }

// ── Field comparison ──────────────────────────────────────────────────────────

interface FieldResult {
  field: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareFields(src: any, reparsed: any, srcWarnings: string[]): FieldResult[] {
  const noteExportOffset: number = src.noteExportOffset ?? 0;
  const results: FieldResult[] = [];

  // Row-truncation warnings from export
  for (const w of srcWarnings) {
    if (w.includes('rows truncated')) {
      results.push({ field: 'rows', status: 'warn', detail: w });
    }
  }

  // songPositions — clamped to 128
  const srcOrder: number[]  = src.songPositions ?? [];
  const expOrder: number[]  = reparsed.songPositions ?? [];
  const clamped = srcOrder.slice(0, 128);
  const orderMatch = clamped.length === expOrder.length &&
    clamped.every((v, i) => v === expOrder[i]);
  results.push({
    field: 'songPositions',
    status: orderMatch ? 'pass' : 'fail',
    detail: orderMatch
      ? `[${expOrder.slice(0, 6).join(',')}${expOrder.length > 6 ? '…' : ''}]`
      : `src[0..5]=[${clamped.slice(0, 5).join(',')}] exp[0..5]=[${expOrder.slice(0, 5).join(',')}]`,
  });

  // numChannels — exporter supports up to 32 channels (multi-channel MOD)
  const srcCh = src.numChannels || src.patterns?.[0]?.channels?.length || 4;
  const expCh = reparsed.numChannels || reparsed.patterns?.[0]?.channels?.length || 4;
  const chOk = expCh === Math.min(32, srcCh);
  results.push({
    field: 'numChannels',
    status: chOk ? 'pass' : 'fail',
    detail: chOk ? `ch=${expCh}${srcCh > 32 ? ` (capped from ${srcCh})` : ''}` : `${srcCh} → ${expCh}`,
  });

  // Instruments (up to 31)
  // The exporter writes srcInsts[i] → MOD slot i+1.
  // parseMOD skips zero-length samples and assigns id = original slot (i+1).
  // So compare by MOD slot number: srcInsts[i] (slot=i+1) vs expInst with id=i+1.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcInsts: any[] = src.instruments ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expInsts: any[] = reparsed.instruments ?? [];

  // Build a map from MOD slot ID to re-parsed instrument
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expById = new Map<number, any>();
  for (const ei of expInsts) {
    if (ei?.id) expById.set(ei.id, ei);
  }

  const checkCount = Math.min(srcInsts.length, 31);
  let instPass = true;
  const instFailDetails: string[] = [];
  let nonEmptyChecked = 0;

  for (let i = 0; i < checkCount; i++) {
    const si = srcInsts[i];
    if (!si) continue;

    // Only compare instruments that have audio data (non-empty in source)
    // The exporter writes lengthWords > 0 only for instruments with actual audio.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ab = (si as any)?.sample?.audioBuffer as ArrayBuffer | undefined;
    const hasAudio = ab && ab.byteLength > 0;
    if (!hasAudio) continue; // empty source instrument → empty MOD slot → skip comparison

    const moSlot = i + 1; // MOD slot number (1-indexed)
    const ei = expById.get(moSlot);
    if (!ei) {
      // Source had audio but re-parsed MOD has no instrument at this slot
      instFailDetails.push(`inst[${moSlot}] "${si.name ?? ''}" missing in re-parsed MOD`);
      instPass = false;
      continue;
    }
    nonEmptyChecked++;

    // name (first 22 ASCII chars)
    // Apply the same 7-bit masking that padString uses when writing the MOD.
    // Source names may have bytes > 127; masking with & 0x7F turns e.g. 128→0 (null),
    // which MOD re-parser stops reading at. Normalize both sides the same way.
    function applyMODNameMask(raw: string): string {
      const out: string[] = [];
      for (let k = 0; k < Math.min(raw.length, 22); k++) {
        const b = raw.charCodeAt(k) & 0x7F;
        if (b === 0) break;
        out.push(String.fromCharCode(b));
      }
      return out.join('');
    }
    const srcName = applyMODNameMask(si.name ?? '');
    const expName = (ei.name ?? '').substring(0, 22);
    if (srcName !== expName) {
      instFailDetails.push(`inst[${moSlot}].name "${srcName}" → "${expName}"`);
      instPass = false;
    }

    // volume (defaultVolume rounded, 0-64)
    const srcVol = typeof si.metadata?.modPlayback?.defaultVolume === 'number'
      ? Math.min(64, Math.round(si.metadata.modPlayback.defaultVolume))
      : 64;
    const expVol = typeof ei.metadata?.modPlayback?.defaultVolume === 'number'
      ? Math.min(64, Math.round(ei.metadata.modPlayback.defaultVolume))
      : 64;
    if (srcVol !== expVol) {
      instFailDetails.push(`inst[${moSlot}].volume ${srcVol} → ${expVol}`);
      instPass = false;
    }

    // finetune roundtrip
    const fineRaw: number = si.metadata?.modPlayback?.finetune ?? 0;
    const fineClamped = Math.max(-8, Math.min(7, fineRaw));
    const expFine: number = ei.metadata?.modPlayback?.finetune ?? 0;
    if (fineClamped !== expFine) {
      instFailDetails.push(`inst[${moSlot}].finetune ${fineClamped} → ${expFine}`);
      instPass = false;
    }
  }

  results.push({
    field: 'instruments',
    status: instPass ? 'pass' : 'fail',
    detail: instFailDetails.length > 0 ? instFailDetails.slice(0, 3).join('; ') : `${nonEmptyChecked} insts ok`,
  });

  // Patterns: check note/instrument/effect round-trip for first few patterns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcPats: any[] = src.patterns ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expPats: any[] = reparsed.patterns ?? [];
  const srcOrders: number[] = src.songPositions ?? [];
  const maxPatIdx = srcOrders.reduce((m: number, v: number) => Math.max(m, v), 0);
  const writePatCount = Math.min(maxPatIdx + 1, 128);
  // First PLAYED pattern (where exporter injects F-speed/F-BPM)
  const firstPlayedPat = srcOrders.length > 0 ? srcOrders[0] : 0;

  // Pre-scan: replicate the exporter's instrResample logic to predict period clamping.
  // HivelySynth instruments exclusively used at out-of-range periods get their waveform
  // resampled, so the exported period is halved/doubled — predictReparsedNote must know this.
  const PT_COMPARE_MIN = 113, PT_COMPARE_MAX = 856;
  interface PeriodFlags { low: boolean; ok: boolean; high: boolean; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instrPeriodFlags: PeriodFlags[] = Array.from({length: 33}, () => ({low:false, ok:false, high:false}));
  for (const sp of srcPats) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ch of (sp?.channels ?? []) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const cell of (ch?.rows ?? []) as any[]) {
        const note = cell?.note ?? 0;
        const instrIdx = Math.min(cell?.instrument ?? 0, 32);
        if (note <= 0 || note >= 97 || instrIdx < 1) continue;
        const period = noteToMODPeriod(note + noteExportOffset);
        if (period === 0) continue;
        const f = instrPeriodFlags[instrIdx];
        if (period > PT_COMPARE_MAX) f.low = true;
        else if (period < PT_COMPARE_MIN) f.high = true;
        else f.ok = true;
      }
    }
  }
  const instrClampPeriod: boolean[] = new Array(33).fill(false);
  for (let i = 1; i <= 32; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = i <= srcInsts.length ? (srcInsts[i - 1] as any) : null;
    if (inst?.synthType !== 'HivelySynth') continue;
    const f = instrPeriodFlags[i];
    if ((f.low && !f.ok && !f.high) || (f.high && !f.ok && !f.low)) instrClampPeriod[i] = true;
  }

  let cellPass = true;
  let cellFailCount = 0;
  const cellFailDetails: string[] = [];

  outer: for (let p = 0; p < Math.min(writePatCount, srcPats.length, expPats.length); p++) {
    const sp = srcPats[p];
    const ep = expPats[p];
    if (!sp || !ep) continue;
    const numRows = Math.min(sp.length ?? sp.channels?.[0]?.rows?.length ?? 64, 64);
    const numCh   = Math.min(srcCh, sp.channels?.length ?? srcCh, ep.channels?.length ?? srcCh);

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCh; c++) {
        const sc = sp.channels?.[c]?.rows?.[r];
        const ec = ep.channels?.[c]?.rows?.[r];

        // note: predict what note the MOD parser would produce for the source note,
        // then compare against the actual re-parsed note.
        // This handles the naming-convention difference between Amiga formats and MOD.
        const srcNote = sc?.note ?? 0;
        const expNote = ec?.note ?? 0;
        const cellInstrIdx = Math.min(sc?.instrument ?? 0, 32);
        const predictedNote = predictReparsedNote(srcNote, instrClampPeriod[cellInstrIdx], noteExportOffset);
        if (predictedNote !== expNote) {
          cellFailDetails.push(`pat${p}r${r}ch${c}: note ${srcNote}→expected ${predictedNote} got ${expNote}`);
          cellPass = false;
          cellFailCount++;
          if (cellFailCount >= 3) break outer;
        }

        // instrument
        const srcInstr = Math.min(sc?.instrument ?? 0, 31);
        const expInstr = ec?.instrument ?? 0;
        if (srcInstr !== expInstr) {
          cellFailDetails.push(`pat${p}r${r}ch${c}: instr ${srcInstr}→${expInstr}`);
          cellPass = false;
          cellFailCount++;
          if (cellFailCount >= 3) break outer;
        }

        // effect (only 0-F pass through)
        const srcEt  = sc?.effTyp  ?? 0;
        const srcEf  = sc?.eff     ?? 0;
        const srcVol = sc?.volume  ?? 0; // volume column (0x10=vol0..0x50=vol64)
        const expEt  = ec?.effTyp  ?? 0;
        const expEf  = ec?.eff     ?? 0;
        if (srcEt <= 0xF) {
          // If source has no effect but a volume column, exporter promotes it to 0xC.
          // Expected: expEt=0xC, expEf=(srcVol-0x10). This is correct — don't fail.
          const volPromoted = (srcEt === 0 && srcEf === 0 && srcVol >= 0x10 && srcVol <= 0x50)
            && expEt === 0xC && expEf === (srcVol - 0x10);
          // Exporter injects F-speed and F-BPM at row0 of the first PLAYED pattern
          // (firstPlayedPat = orders[0]) into cells with no effect.
          const injSpeed = src.initialSpeed ?? 6;
          const injBPM   = src.initialBPM   ?? 125;
          const speedInjected = p === firstPlayedPat && r === 0 && srcEt === 0 && srcEf === 0
            && expEt === 0xF && expEf === injSpeed;
          const bpmInjected = p === firstPlayedPat && r === 0 && srcEt === 0 && srcEf === 0
            && expEt === 0xF && expEf === injBPM;
          // Exporter injects D00 (pattern break) at the last row of short patterns (<64 rows)
          // to skip trailing empty rows. Don't flag these as mismatches.
          const d00Injected = srcEt === 0 && srcEf === 0 && expEt === 0xD && expEf === 0x00
            && r === numRows - 1 && numRows < 64;
          if (!volPromoted && !speedInjected && !bpmInjected && !d00Injected && (srcEt !== expEt || srcEf !== expEf)) {
            cellFailDetails.push(`pat${p}r${r}ch${c}: eff ${srcEt.toString(16)}${srcEf.toString(16).padStart(2,'0')}→${expEt.toString(16)}${expEf.toString(16).padStart(2,'0')}`);
            cellPass = false;
            cellFailCount++;
            if (cellFailCount >= 3) break outer;
          }
        }
      }
    }
  }

  results.push({
    field: 'cells',
    status: cellPass ? 'pass' : 'fail',
    detail: cellFailDetails.length > 0 ? cellFailDetails.join('; ') : `${writePatCount} patterns ok`,
  });

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

let passed = 0, warned = 0, failed = 0, skipped = 0, errors = 0;

console.log(`\nmod-export-compare — ${cases.length} format(s)${doAudio ? ' (audio enabled)' : ''}`);
console.log('='.repeat(72));

for (const tc of cases) {
  const filePath = join(TEST_DIR, tc.file);
  if (!existsSync(filePath)) {
    console.log(`  SKIP  ${tc.file} (not found)`);
    skipped++;
    continue;
  }

  // ── Parse source ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let song: any;
  try {
    const mod       = await import(tc.parserModule);
    const parseFnFn = mod[tc.parseFn];
    if (!parseFnFn) throw new Error(`No export '${tc.parseFn}'`);
    const fileData  = readFileSync(filePath);
    const buffer    = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer;
    const arg       = tc.args === 'bytes' ? new Uint8Array(buffer) : buffer;
    const name      = tc.filename ?? tc.file;
    song            = tc.isAsync ? await parseFnFn(arg, name) : parseFnFn(arg, name);
    if (!song) throw new Error('Parser returned null');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} parse: ${msg.substring(0, 80)}`);
    errors++;
    continue;
  }

  // Skip formats with no pattern data
  const hasNotes = (song.patterns ?? []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pat: any) => (pat.channels ?? []).some((ch: any) => (ch.rows ?? []).some((row: any) => row.note > 0))
  );
  if (!hasNotes) {
    console.log(`  SKIP  ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} (no pattern data)`);
    skipped++;
    continue;
  }

  // Bake synthesized instruments to looping PCM waveforms
  bakeHivelyInstruments(song);
  bakeSidMon1Instruments(song);
  bakeGenericSynthInstruments(song);

  // ── Export to MOD ────────────────────────────────────────────────────────
  const stem    = safeStem(tc.file);
  const modPath = join(TMP_DIR, `${stem}.mod`);
  let exportWarnings: string[] = [];

  try {
    exportWarnings = exportSongToMOD(song, modPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} export: ${msg.substring(0, 80)}`);
    errors++;
    continue;
  }

  // ── Re-parse exported MOD ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reparsed: any;
  try {
    const modParserMod = await import('../src/lib/import/formats/MODParser');
    const modData      = readFileSync(modPath);
    const modBuf       = modData.buffer.slice(modData.byteOffset, modData.byteOffset + modData.byteLength) as ArrayBuffer;
    reparsed           = await modParserMod.parseMODFile(modBuf, basename(modPath));
    if (!reparsed) throw new Error('parseMODFile returned null');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} reparse: ${msg.substring(0, 80)}`);
    errors++;
    continue;
  }

  // ── Data comparison ──────────────────────────────────────────────────────
  const fieldResults = compareFields(song, reparsed, exportWarnings);
  const hasFail = fieldResults.some(r => r.status === 'fail');
  const hasWarn = fieldResults.some(r => r.status === 'warn');

  // Build summary line
  const chResult  = fieldResults.find(r => r.field === 'numChannels');
  const ordResult = fieldResults.find(r => r.field === 'songPositions');
  const instResult = fieldResults.find(r => r.field === 'instruments');
  const cellResult = fieldResults.find(r => r.field === 'cells');

  const summary = [
    chResult?.detail ?? 'ch=?',
    `order=${ordResult?.detail ?? '?'}`,
    `insts=${instResult?.detail ?? '?'}`,
    `cells=${cellResult?.detail ?? '?'}`,
  ].join(' ');

  // ── Audio comparison ─────────────────────────────────────────────────────
  let audioSuffix = '';
  let audioFail = false;

  if (doAudio) {
    const srcWav = join(WAV_DIR, `${stem}-src.wav`);
    const expWav = join(WAV_DIR, `${stem}-exp.wav`);
    const srcOk  = renderWav(filePath, srcWav);
    const expOk  = srcOk && renderWav(modPath, expWav);

    if (!srcOk) {
      audioSuffix = ' [src render failed]';
    } else if (!expOk) {
      deleteWav(srcWav);
      audioSuffix = ' [exp render failed]';
    } else {
      try {
        const corr = envelopeCorrelation(srcWav, expWav);
        const threshold = tc.audioThreshold ?? 0.90;
        const audioPass = corr >= threshold;
        const thresholdNote = tc.audioThreshold !== undefined ? `(≥${threshold.toFixed(2)})` : '';
        audioSuffix = ` audio=${corr.toFixed(2)}${thresholdNote}${audioPass ? '' : ' AUDIO_FAIL'}`;
        if (!audioPass) audioFail = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        audioSuffix = ` [audio err: ${msg.substring(0, 40)}]`;
      } finally {
        // Delete WAVs immediately to conserve disk space
        deleteWav(srcWav);
        deleteWav(expWav);
      }
    }
  }

  // Determine overall result
  const overallFail = hasFail || audioFail;
  const overallWarn = !overallFail && (hasWarn || exportWarnings.length > 0);

  if (overallFail) {
    const failDetails = fieldResults
      .filter(r => r.status === 'fail')
      .map(r => `${r.field}: ${r.detail}`)
      .join(' | ');
    console.log(`  FAIL  ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} ${failDetails}${audioSuffix}`);
    failed++;
  } else if (overallWarn) {
    const warnDetails = [
      ...fieldResults.filter(r => r.status === 'warn').map(r => r.detail ?? ''),
      ...exportWarnings.filter(w => !w.includes('rows truncated')),
    ].filter(Boolean).join(' | ');
    console.log(`  WARN  ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} ${summary}${audioSuffix}${warnDetails ? ` [${warnDetails}]` : ''}`);
    warned++;
  } else {
    console.log(`  PASS  ${tc.format.padEnd(16)} ${tc.file.padEnd(40)} ${summary}${audioSuffix}`);
    passed++;
  }
}

console.log(`\nDone: ${passed} pass, ${warned} warn, ${failed} fail, ${skipped} skip, ${errors} errors`);
if (failed > 0 || errors > 0) process.exit(1);
