#!/usr/bin/env npx tsx --tsconfig tsconfig.app.json
/**
 * test-native-export.ts — Headless round-trip test for native format exporters
 *
 * Loads test files from public/data/songs/formats/, parses them, exports via
 * the native exporter, and saves the exported file to test-output/ for manual
 * verification in a player (e.g. UADE, XMPlay, OpenMPT, DeliTracker).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json tools/test-native-export.ts              # test all
 *   npx tsx --tsconfig tsconfig.app.json tools/test-native-export.ts hexplosion.hvl  # single file
 *   npx tsx --tsconfig tsconfig.app.json tools/test-native-export.ts --list        # list files
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';

// ── Format→Parser→Exporter mapping ─────────────────────────────────────────

interface FormatEntry {
  /** File extensions (lowercase, without dot) */
  extensions: string[];
  /** Amiga-style prefix (e.g. 'mdat' for TFMX) */
  prefixes?: string[];
  /** Parser module path (relative to src/) */
  parserModule: string;
  /** Parser function name */
  parseFn: string;
  /** Does the parser take (ArrayBuffer, filename) or (Uint8Array, filename)? */
  parserInput: 'arraybuffer' | 'uint8array';
  /** Exporter module path (relative to src/) */
  exporterModule: string;
  /** Exporter function name */
  exportFn: string;
  /** Output file extension */
  outExt: string;
  /** Format label for display */
  label: string;
}

const FORMATS: FormatEntry[] = [
  // ── Hively / AHX ─────────────────────────────────────────────────────────
  { extensions: ['hvl'], prefixes: [], parserModule: 'lib/import/formats/HivelyParser', parseFn: 'parseHivelyFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/HivelyExporter', exportFn: 'exportAsHively', outExt: 'hvl', label: 'HivelyTracker' },
  { extensions: ['ahx'], prefixes: [], parserModule: 'lib/import/formats/HivelyParser', parseFn: 'parseHivelyFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/HivelyExporter', exportFn: 'exportAsHively', outExt: 'ahx', label: 'AHX' },
  // ── Oktalyzer ─────────────────────────────────────────────────────────────
  { extensions: ['okta', 'okt'], prefixes: [], parserModule: 'lib/import/formats/OktalyzerParser', parseFn: 'parseOktalyzerFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/OktalyzerExporter', exportFn: 'exportOktalyzer', outExt: 'okt', label: 'Oktalyzer' },
  // ── DigiBooster ───────────────────────────────────────────────────────────
  { extensions: ['digi'], prefixes: [], parserModule: 'lib/import/formats/DigiBoosterParser', parseFn: 'parseDigiBoosterFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/DigiBoosterExporter', exportFn: 'exportDigiBooster', outExt: 'dbm', label: 'DigiBooster' },
  // ── DigiBooster Pro ───────────────────────────────────────────────────────
  { extensions: ['dbm'], prefixes: [], parserModule: 'lib/import/formats/DigiBoosterProParser', parseFn: 'parseDigiBoosterProFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/DigiBoosterProExporter', exportFn: 'exportDigiBoosterPro', outExt: 'dbm', label: 'DigiBooster Pro' },
  // ── Future Composer ───────────────────────────────────────────────────────
  { extensions: ['fc', 'fc13', 'fc14'], prefixes: ['fc'], parserModule: 'lib/import/formats/FCParser', parseFn: 'parseFCFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/FCExporter', exportFn: 'exportFC', outExt: 'fc', label: 'Future Composer' },
  // ── JamCracker ────────────────────────────────────────────────────────────
  { extensions: ['jam'], prefixes: [], parserModule: 'lib/import/formats/JamCrackerParser', parseFn: 'parseJamCrackerFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/JamCrackerExporter', exportFn: 'exportAsJamCracker', outExt: 'jam', label: 'JamCracker' },
  // ── SoundMon ──────────────────────────────────────────────────────────────
  { extensions: ['bp', 'bp3'], prefixes: [], parserModule: 'lib/import/formats/SoundMonParser', parseFn: 'parseSoundMonFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/SoundMonExporter', exportFn: 'exportAsSoundMon', outExt: 'bp', label: 'SoundMon' },
  // ── SoundFX ───────────────────────────────────────────────────────────────
  { extensions: ['sfx', 'sfx2'], prefixes: [], parserModule: 'lib/import/formats/SoundFXParser', parseFn: 'parseSoundFXFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/SoundFXExporter', exportFn: 'exportSoundFX', outExt: 'sfx', label: 'SoundFX' },
  // ── InStereo 2.0 ─────────────────────────────────────────────────────────
  { extensions: ['is20', 'is'], prefixes: [], parserModule: 'lib/import/formats/InStereo2Parser', parseFn: 'parseInStereo2File', parserInput: 'uint8array', exporterModule: 'lib/export/InStereo2Exporter', exportFn: 'exportInStereo2', outExt: 'is20', label: 'InStereo 2.0' },
  // ── InStereo 1.0 ─────────────────────────────────────────────────────────
  { extensions: ['is10'], prefixes: [], parserModule: 'lib/import/formats/InStereo1Parser', parseFn: 'parseInStereo1File', parserInput: 'uint8array', exporterModule: 'lib/export/InStereo1Exporter', exportFn: 'exportInStereo1', outExt: 'is10', label: 'InStereo 1.0' },
  // ── DeltaMusic 1 ──────────────────────────────────────────────────────────
  { extensions: ['dm', 'dm1'], prefixes: [], parserModule: 'lib/import/formats/DeltaMusic1Parser', parseFn: 'parseDeltaMusic1File', parserInput: 'arraybuffer', exporterModule: 'lib/export/DeltaMusic1Exporter', exportFn: 'exportDeltaMusic1', outExt: 'dm1', label: 'DeltaMusic 1' },
  // ── DeltaMusic 2 ──────────────────────────────────────────────────────────
  { extensions: ['dm2'], prefixes: [], parserModule: 'lib/import/formats/DeltaMusic2Parser', parseFn: 'parseDeltaMusic2File', parserInput: 'arraybuffer', exporterModule: 'lib/export/DeltaMusic2Exporter', exportFn: 'exportDeltaMusic2', outExt: 'dm2', label: 'DeltaMusic 2' },
  // ── Digital Mugician ──────────────────────────────────────────────────────
  { extensions: ['dmu', 'mug', 'mug2'], prefixes: [], parserModule: 'lib/import/formats/DigitalMugicianParser', parseFn: 'parseDigitalMugicianFile', parserInput: 'uint8array', exporterModule: 'lib/export/DigitalMugicianExporter', exportFn: 'exportDigitalMugician', outExt: 'dmu', label: 'Digital Mugician' },
  // ── SidMon 1 ──────────────────────────────────────────────────────────────
  { extensions: ['sid1'], prefixes: [], parserModule: 'lib/import/formats/SidMon1Parser', parseFn: 'parseSidMon1File', parserInput: 'arraybuffer', exporterModule: 'lib/export/SidMon1Exporter', exportFn: 'exportSidMon1', outExt: 'sid1', label: 'SidMon 1' },
  // ── Sonic Arranger ────────────────────────────────────────────────────────
  { extensions: ['sa'], prefixes: [], parserModule: 'lib/import/formats/SonicArrangerParser', parseFn: 'parseSonicArrangerFile', parserInput: 'uint8array', exporterModule: 'lib/export/SonicArrangerExporter', exportFn: 'exportSonicArranger', outExt: 'sa', label: 'Sonic Arranger' },
  // ── TFMX ──────────────────────────────────────────────────────────────────
  { extensions: ['tfmx'], prefixes: ['mdat'], parserModule: 'lib/import/formats/TFMXParser', parseFn: 'parseTFMXFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/TFMXExporter', exportFn: 'exportTFMX', outExt: 'tfmx', label: 'TFMX' },
  // ── Fred Editor ───────────────────────────────────────────────────────────
  { extensions: ['fred'], prefixes: ['fred'], parserModule: 'lib/import/formats/FredEditorParser', parseFn: 'parseFredEditorFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/FredEditorExporter', exportFn: 'exportFredEditor', outExt: 'fred', label: 'Fred Editor' },
  // ── TCB Tracker ───────────────────────────────────────────────────────────
  { extensions: ['tcb'], prefixes: [], parserModule: 'lib/import/formats/TCBTrackerParser', parseFn: 'parseTCBTrackerFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/TCBTrackerExporter', exportFn: 'exportTCBTracker', outExt: 'tcb', label: 'TCB Tracker' },
  // ── Game Music Creator ────────────────────────────────────────────────────
  { extensions: ['gmc'], prefixes: [], parserModule: 'lib/import/formats/GameMusicCreatorParser', parseFn: 'parseGameMusicCreatorFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/GameMusicCreatorExporter', exportFn: 'exportGameMusicCreator', outExt: 'gmc', label: 'Game Music Creator' },
  // ── Quadra Composer ───────────────────────────────────────────────────────
  { extensions: ['emod'], prefixes: [], parserModule: 'lib/import/formats/QuadraComposerParser', parseFn: 'parseQuadraComposerFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/QuadraComposerExporter', exportFn: 'exportQuadraComposer', outExt: 'emod', label: 'Quadra Composer' },
  // ── HippelCoSo ────────────────────────────────────────────────────────────
  { extensions: ['hipc'], prefixes: [], parserModule: 'lib/import/formats/HippelCoSoParser', parseFn: 'parseHippelCoSoFile', parserInput: 'uint8array', exporterModule: 'lib/export/HippelCoSoExporter', exportFn: 'exportAsHippelCoSo', outExt: 'hipc', label: 'Hippel CoSo' },
  // ── Digital Symphony ──────────────────────────────────────────────────────
  { extensions: ['dsym'], prefixes: [], parserModule: 'lib/import/formats/DigitalSymphonyParser', parseFn: 'parseDigitalSymphonyFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/DigitalSymphonyExporter', exportFn: 'exportDigitalSymphony', outExt: 'dsym', label: 'Digital Symphony' },
  // ── Composer 669 ──────────────────────────────────────────────────────────
  { extensions: ['669'], prefixes: [], parserModule: 'lib/import/formats/Composer667Parser', parseFn: 'parseComposer667File', parserInput: 'arraybuffer', exporterModule: 'lib/export/Composer667Exporter', exportFn: 'exportComposer667', outExt: '669', label: 'Composer 669' },
  // ── IMS ───────────────────────────────────────────────────────────────────
  { extensions: ['ims'], prefixes: [], parserModule: 'lib/import/formats/IMSParser', parseFn: 'parseIMSFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/IMSExporter', exportFn: 'exportIMS', outExt: 'ims', label: 'Images Music System' },
  // ── STP ───────────────────────────────────────────────────────────────────
  { extensions: ['stp'], prefixes: [], parserModule: 'lib/import/formats/STPParser', parseFn: 'parseSTPFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/STPExporter', exportFn: 'exportSTP', outExt: 'stp', label: 'Soundtracker Pro' },
  // ── UNIC ──────────────────────────────────────────────────────────────────
  { extensions: ['unic'], prefixes: [], parserModule: 'lib/import/formats/UNICParser', parseFn: 'parseUNICFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/UNICExporter', exportFn: 'exportUNIC', outExt: 'unic', label: 'UNIC Tracker' },
  // ── DSS ───────────────────────────────────────────────────────────────────
  { extensions: ['dss'], prefixes: [], parserModule: 'lib/import/formats/DigitalSoundStudioParser', parseFn: 'parseDigitalSoundStudioFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/DSSExporter', exportFn: 'exportDSS', outExt: 'dss', label: 'Digital Sound Studio' },
  // ── XMF ───────────────────────────────────────────────────────────────────
  { extensions: ['xmf'], prefixes: [], parserModule: 'lib/import/formats/XMFParser', parseFn: 'parseXMFFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/XMFExporter', exportFn: 'exportXMF', outExt: 'xmf', label: 'Extended Module Format' },
  // ── Activision Pro ────────────────────────────────────────────────────────
  { extensions: ['ast'], prefixes: [], parserModule: 'lib/import/formats/ActivisionProParser', parseFn: 'parseActivisionProFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/ActivisionProExporter', exportFn: 'exportActivisionPro', outExt: 'ast', label: 'Activision Pro' },
  // ── Sawteeth ──────────────────────────────────────────────────────────────
  { extensions: ['smod'], prefixes: [], parserModule: 'lib/import/formats/SawteethParser', parseFn: 'parseSawteethFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/SawteethExporter', exportFn: 'exportSawteeth', outExt: 'smod', label: 'Sawteeth' },
  // ── Face The Music ────────────────────────────────────────────────────────
  { extensions: ['ftm'], prefixes: [], parserModule: 'lib/import/formats/FaceTheMusicParser', parseFn: 'parseFaceTheMusicFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/FaceTheMusicExporter', exportFn: 'exportFaceTheMusic', outExt: 'ftm', label: 'Face The Music' },
  // ── AMOS Music Bank ───────────────────────────────────────────────────────
  { extensions: ['abk'], prefixes: [], parserModule: 'lib/import/formats/AMOSMusicBankParser', parseFn: 'parseAMOSMusicBankFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/AMOSMusicBankExporter', exportFn: 'exportAMOSMusicBank', outExt: 'abk', label: 'AMOS Music Bank' },
  // ── SymphoniePro ──────────────────────────────────────────────────────────
  { extensions: ['symmod'], prefixes: [], parserModule: 'lib/import/formats/SymphonieProParser', parseFn: 'parseSymphonieProFile', parserInput: 'arraybuffer', exporterModule: 'lib/export/SymphonieProExporter', exportFn: 'exportSymphonieProFile', outExt: 'symmod', label: 'Symphonie Pro' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_ROOT = join(import.meta.dirname || __dirname, '..');
const SONGS_DIR = join(PROJECT_ROOT, 'public/data/songs/formats');
const OUTPUT_DIR = join(PROJECT_ROOT, 'test-output/native-export');

function findFormatForFile(filename: string): FormatEntry | null {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() || '';
  const prefix = lower.split('.')[0];

  for (const fmt of FORMATS) {
    if (fmt.extensions.includes(ext)) return fmt;
    if (fmt.prefixes?.includes(prefix)) return fmt;
  }
  return null;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ── Main ────────────────────────────────────────────────────────────────────

interface TestResult {
  file: string;
  format: string;
  parseOk: boolean;
  exportOk: boolean;
  outFile?: string;
  outSize?: number;
  origSize: number;
  warnings: string[];
  error?: string;
}

async function testFile(filepath: string): Promise<TestResult> {
  const filename = basename(filepath);
  const fmt = findFormatForFile(filename);
  const origBuf = readFileSync(filepath);
  const origSize = origBuf.byteLength;

  if (!fmt) {
    return { file: filename, format: '?', parseOk: false, exportOk: false, origSize, warnings: [], error: 'No format mapping' };
  }

  try {
    // 1. Dynamic import of parser
    const parserMod = await import(join(PROJECT_ROOT, 'src', fmt.parserModule));
    const parseFn = parserMod[fmt.parseFn];
    if (!parseFn) throw new Error(`Parser function ${fmt.parseFn} not found in ${fmt.parserModule}`);

    // 2. Parse
    const input = fmt.parserInput === 'uint8array'
      ? new Uint8Array(toArrayBuffer(origBuf))
      : toArrayBuffer(origBuf);
    const song = await parseFn(input, filename);
    if (!song) throw new Error('Parser returned null');

    // 3. Dynamic import of exporter
    const exporterMod = await import(join(PROJECT_ROOT, 'src', fmt.exporterModule));
    const exportFn = exporterMod[fmt.exportFn];
    if (!exportFn) throw new Error(`Export function ${fmt.exportFn} not found in ${fmt.exporterModule}`);

    // 4. Export
    const result = await exportFn(song);

    // 5. Extract binary data from result
    let outBytes: Uint8Array;
    let outFilename: string;
    let warnings: string[] = [];

    if (result instanceof ArrayBuffer) {
      outBytes = new Uint8Array(result);
      outFilename = filename.replace(/\.[^.]+$/, `.exported.${fmt.outExt}`);
    } else if (result instanceof Uint8Array) {
      outBytes = result;
      outFilename = filename.replace(/\.[^.]+$/, `.exported.${fmt.outExt}`);
    } else if (result && typeof result === 'object') {
      // { data: Blob, filename, warnings } pattern
      if (result.data instanceof Blob) {
        const ab = await result.data.arrayBuffer();
        outBytes = new Uint8Array(ab);
      } else if (result.data instanceof ArrayBuffer) {
        outBytes = new Uint8Array(result.data);
      } else if (result.data instanceof Uint8Array) {
        outBytes = result.data;
      } else {
        throw new Error('Unknown export result data type');
      }
      outFilename = result.filename || filename.replace(/\.[^.]+$/, `.exported.${fmt.outExt}`);
      warnings = result.warnings || [];
    } else {
      throw new Error('Unknown export result type');
    }

    // 6. Save to disk
    const outPath = join(OUTPUT_DIR, outFilename);
    writeFileSync(outPath, outBytes);

    const sizeRatio = outBytes.byteLength / origSize;
    const sizeNote = sizeRatio < 0.5 ? ' (much smaller!)' : sizeRatio > 2.0 ? ' (much larger!)' : '';

    return {
      file: filename,
      format: fmt.label,
      parseOk: true,
      exportOk: true,
      outFile: outFilename,
      outSize: outBytes.byteLength,
      origSize,
      warnings,
    };
  } catch (err) {
    return {
      file: filename,
      format: fmt.label,
      parseOk: false,
      exportOk: false,
      origSize,
      warnings: [],
      error: (err as Error).message,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  // List mode
  if (args.includes('--list')) {
    const files = readdirSync(SONGS_DIR).sort();
    for (const f of files) {
      const fmt = findFormatForFile(f);
      console.log(`  ${fmt ? '✓' : '·'} ${f.padEnd(45)} ${fmt?.label || '(no exporter)'}`);
    }
    const matched = files.filter(f => findFormatForFile(f)).length;
    console.log(`\n${matched}/${files.length} files have native exporters`);
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Determine files to test
  let filesToTest: string[];
  if (args.length > 0 && !args[0].startsWith('--')) {
    // Specific file(s) given
    filesToTest = args.map(a => {
      const full = join(SONGS_DIR, a);
      if (existsSync(full)) return full;
      // Try as absolute path
      if (existsSync(a)) return a;
      console.error(`File not found: ${a}`);
      process.exit(1);
    });
  } else {
    // All files with matching exporters
    filesToTest = readdirSync(SONGS_DIR)
      .filter(f => findFormatForFile(f) !== null)
      .map(f => join(SONGS_DIR, f))
      .sort();
  }

  console.log(`Testing ${filesToTest.length} files → ${OUTPUT_DIR}\n`);

  const results: TestResult[] = [];
  for (const filepath of filesToTest) {
    const result = await testFile(filepath);
    results.push(result);

    const status = result.exportOk ? '✓' : '✗';
    const size = result.outSize
      ? `${(result.origSize / 1024).toFixed(1)}KB → ${(result.outSize / 1024).toFixed(1)}KB`
      : '';
    const warn = result.warnings.length > 0 ? ` [${result.warnings.length} warnings]` : '';
    const err = result.error ? ` ERROR: ${result.error}` : '';
    console.log(`  ${status} ${result.file.padEnd(40)} ${result.format.padEnd(22)} ${size}${warn}${err}`);
  }

  // Summary
  const passed = results.filter(r => r.exportOk).length;
  const failed = results.filter(r => !r.exportOk).length;
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} total`);

  if (passed > 0) {
    console.log(`\nExported files saved to: ${OUTPUT_DIR}`);
    console.log('Load them in UADE, XMPlay, or OpenMPT to verify playback.');
  }

  // Save JSON report
  const reportPath = join(OUTPUT_DIR, 'test-report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Full report: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
