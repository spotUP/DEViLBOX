/**
 * mod-export-test.ts — Verify MOD export pattern data accuracy
 *
 * For each natively-parsed Amiga/tracker format in .test-formats/, parses the
 * source file, exports to MOD, then parses the MOD binary and compares notes
 * row-by-row against the original TrackerSong pattern data.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json tools/mod-export-test.ts
 *   npx tsx --tsconfig tsconfig.app.json tools/mod-export-test.ts anthrox.fc
 *   npx tsx --tsconfig tsconfig.app.json tools/mod-export-test.ts --out /tmp/mods
 *   npx tsx --tsconfig tsconfig.app.json tools/mod-export-test.ts anthrox.fc --out /tmp/mods
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

// ── Path setup ───────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'public/data/songs/formats');

// ── ProTracker period table (3 octaves × 12 semitones, index 0 = C-1) ───────
// Maps period value → XM note number (1-based, C-1 = 13)

const PT_PERIODS = [
  856,808,762,720,678,640,604,570,538,508,480,453, // C-1..B-1
  428,404,381,360,339,320,302,285,269,254,240,226, // C-2..B-2
  214,202,190,180,170,160,151,143,135,127,120,113, // C-3..B-3
];
const PT_PERIODS_EXT = [
  ...PT_PERIODS,
  107,101, 95, 90, 85, 80, 75, 71, 67, 63, 60, 56, // C-4..B-4
   53, 50, 47, 45, 42, 40, 37, 35, 33, 31, 30, 28, // C-5..B-5
   27, 25, 24, 22, 21, 20, 19, 18, 17, 16, 15, 14, // C-6..B-6
];

function periodToXMNote(period: number): number {
  if (period === 0) return 0;
  // Find closest period
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS_EXT.length; i++) {
    const d = Math.abs(PT_PERIODS_EXT[i] - period);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  // XM note: index 0 = C-1 = XM note 13
  return best + 13;
}

const NOTE_NAMES = ['C-','C#','D-','D#','E-','F-','F#','G-','G#','A-','A#','B-'];
function xmNoteToStr(n: number): string {
  if (n === 0) return '---';
  if (n === 97) return 'OFF';
  const octave = Math.floor((n - 1) / 12);
  const semi   = (n - 1) % 12;
  return `${NOTE_NAMES[semi]}${octave}`;
}

// ── MOD binary parser ────────────────────────────────────────────────────────

const PCM_CHECK_BYTES = 32; // how many sample bytes to compare for content check

// Mirrors extractPCM8FromWAV in modExport.ts exactly:
//   16-bit LE WAV → signed 8-bit (high byte of each sample)
function extractPCM8FromWAVBuf(buf: ArrayBuffer): Int8Array {
  if (buf.byteLength < 44) return new Int8Array(0);
  const view = new DataView(buf);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    result[i] = view.getInt16(44 + i * 2, true) >> 8;
  }
  return result;
}

interface MODCell {
  period: number;
  instrument: number;
  effect: number;
  param: number;
  xmNote: number;
}

interface MODPattern {
  rows: MODCell[][];  // [row][channel]
}

interface MODSample {
  name: string;           // up to 22 chars, null-terminated
  lengthWords: number;    // 0 = empty slot
  finetune: number;       // signed -8..+7
  volume: number;         // 0-64
  loopStartWords: number;
  loopLenWords: number;   // 1 = no loop (ProTracker convention)
  pcmPrefix: Int8Array;   // first PCM_CHECK_BYTES bytes of sample data
}

interface MODFile {
  name: string;
  numOrders: number;
  orders: number[];
  numChannels: number;
  numPatterns: number;
  patterns: MODPattern[];
  samples: MODSample[];
}

function parseMOD(buf: ArrayBuffer): MODFile {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  const name = String.fromCharCode(...bytes.slice(0, 20)).replace(/\0/g, '').trim();

  // ── Sample headers (31 × 30 bytes at offset 20) ─────────────────────────
  const samples: MODSample[] = [];
  for (let i = 0; i < 31; i++) {
    const base = 20 + i * 30;
    // Null-terminated name (not trimmed, to catch trailing-space diffs)
    let nameEnd = base + 22;
    for (let j = base; j < base + 22; j++) { if (bytes[j] === 0) { nameEnd = j; break; } }
    const smpName = String.fromCharCode(...bytes.slice(base, nameEnd));
    const lengthWords = view.getUint16(base + 22, false);
    const finRaw = bytes[base + 24] & 0x0F;
    const finetune = finRaw >= 8 ? finRaw - 16 : finRaw;
    const volume = bytes[base + 25];
    const loopStartWords = view.getUint16(base + 26, false);
    const loopLenWords   = view.getUint16(base + 28, false);
    samples.push({ name: smpName, lengthWords, finetune, volume, loopStartWords, loopLenWords, pcmPrefix: new Int8Array(0) });
  }

  // Magic at 1080 → determine channel count
  const magic = String.fromCharCode(bytes[1080], bytes[1081], bytes[1082], bytes[1083]);
  let numChannels: number;
  if (magic === 'M.K.' || magic === 'M!K!' || magic === 'FLT4' || magic === 'M&K!') {
    numChannels = 4;
  } else if (magic === 'FLT8' || magic === 'OCTA' || magic === 'CD81') {
    numChannels = 8;
  } else if (magic[2] === 'C' && magic[3] === 'H' && magic[0] >= '0' && magic[0] <= '9') {
    numChannels = parseInt(magic.substring(0, 2));
  } else if (magic[1] === 'C' && magic[2] === 'H' && magic[3] === 'N') {
    numChannels = parseInt(magic[0]);
  } else {
    numChannels = 4; // default
  }

  const numOrders = bytes[950];
  const orders: number[] = [];
  let maxPatIdx = 0;
  for (let i = 0; i < 128; i++) {
    const o = bytes[952 + i];
    orders.push(o);
    if (i < numOrders && o > maxPatIdx) maxPatIdx = o;
  }

  const numPatterns = maxPatIdx + 1;
  const patternDataStart = 1084;
  const bytesPerPattern = numChannels * 64 * 4;

  const patterns: MODPattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    const rows: MODCell[][] = [];
    for (let row = 0; row < 64; row++) {
      const cells: MODCell[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        const base = patternDataStart + p * bytesPerPattern + row * numChannels * 4 + ch * 4;
        if (base + 3 >= buf.byteLength) {
          cells.push({ period: 0, instrument: 0, effect: 0, param: 0, xmNote: 0 });
          continue;
        }
        const b0 = bytes[base];
        const b1 = bytes[base + 1];
        const b2 = bytes[base + 2];
        const b3 = bytes[base + 3];
        const period = ((b0 & 0x0F) << 8) | b1;
        const instrument = (b0 & 0x10) | ((b2 >> 4) & 0x0F);
        const effect = b2 & 0x0F;
        const param = b3;
        cells.push({ period, instrument, effect, param, xmNote: periodToXMNote(period) });
      }
      rows.push(cells);
    }
    patterns.push({ rows });
  }

  // ── Sample PCM data (after pattern block) ────────────────────────────────
  let smpOff = patternDataStart + numPatterns * bytesPerPattern;
  for (const smp of samples) {
    const smpBytes = smp.lengthWords * 2;
    if (smpBytes > 0 && smpOff + PCM_CHECK_BYTES <= buf.byteLength) {
      const readLen = Math.min(PCM_CHECK_BYTES, smpBytes, buf.byteLength - smpOff);
      smp.pcmPrefix = new Int8Array(buf.slice(smpOff, smpOff + readLen));
    }
    smpOff += smpBytes;
  }

  return { name, numOrders, orders: orders.slice(0, numOrders), numChannels, numPatterns, patterns, samples };
}

// ── Instrument comparison ────────────────────────────────────────────────────

function compareInstruments(
  song: import('../src/engine/TrackerReplayer').TrackerSong,
  modFile: MODFile,
): string[] {
  const issues: string[] = [];
  const srcInsts = song.instruments ?? [];
  const maxSlots = Math.min(srcInsts.length, 31);

  for (let i = 0; i < maxSlots; i++) {
    const src = srcInsts[i];
    const mod = modFile.samples[i];
    if (!src || !mod) continue;

    // ── Name ──────────────────────────────────────────────────────────────
    const srcName = (src.name ?? '').substring(0, 22);
    if (srcName !== mod.name) {
      issues.push(`inst${i + 1}: name "${srcName}" → "${mod.name}"`);
    }

    const hasBuf = !!(src.sample?.audioBuffer && (src.sample.audioBuffer as ArrayBuffer).byteLength > 44);

    if (hasBuf) {
      // ── Sample instrument: check length, PCM content, loop ─────────────
      const expectedPcm = extractPCM8FromWAVBuf(src.sample!.audioBuffer as ArrayBuffer);
      const expectedBytes = Math.min(expectedPcm.length, 131070) & ~1; // word-align (mirrors modExport)
      const modBytes = mod.lengthWords * 2;

      if (modBytes === 0 && expectedBytes > 0) {
        issues.push(`inst${i + 1}: expected ${expectedBytes}B, got empty`);
      } else if (Math.abs(expectedBytes - modBytes) > 2) {
        issues.push(`inst${i + 1}: length ${expectedBytes}B → ${modBytes}B`);
      }

      // PCM byte content (first PCM_CHECK_BYTES)
      const checkLen = Math.min(PCM_CHECK_BYTES, expectedPcm.length, mod.pcmPrefix.length);
      let firstMismatch = -1;
      for (let b = 0; b < checkLen; b++) {
        if (expectedPcm[b] !== mod.pcmPrefix[b]) { firstMismatch = b; break; }
      }
      if (firstMismatch >= 0) {
        issues.push(
          `inst${i + 1}: PCM[${firstMismatch}] src=${expectedPcm[firstMismatch]} mod=${mod.pcmPrefix[firstMismatch]}`,
        );
      }

      // Loop presence
      const srcHasLoop = src.sample?.loop ?? false;
      const modHasLoop = mod.loopLenWords > 1;
      if (srcHasLoop !== modHasLoop) {
        issues.push(`inst${i + 1}: loop ${srcHasLoop} → ${modHasLoop}`);
      }

      // Loop start/end (only when both agree there is a loop)
      if (srcHasLoop && modHasLoop) {
        const srcLoopStartWords = Math.floor((src.sample!.loopStart ?? 0) / 2);
        const srcLoopLen = Math.max(0, (src.sample!.loopEnd ?? 0) - (src.sample!.loopStart ?? 0));
        const srcLoopLenWords = Math.max(1, Math.floor(srcLoopLen / 2));
        if (Math.abs(mod.loopStartWords - srcLoopStartWords) > 1) {
          issues.push(`inst${i + 1}: loopStart ${srcLoopStartWords}w → ${mod.loopStartWords}w`);
        }
        if (Math.abs(mod.loopLenWords - srcLoopLenWords) > 1) {
          issues.push(`inst${i + 1}: loopLen ${srcLoopLenWords}w → ${mod.loopLenWords}w`);
        }
      }

      // Volume (0-64)
      const srcVol = Math.min(64, Math.max(0, src.metadata?.modPlayback?.defaultVolume ?? 64));
      if (mod.volume !== srcVol) {
        issues.push(`inst${i + 1}: vol ${srcVol} → ${mod.volume}`);
      }

    } else {
      // ── Synth or empty sample: slot should be empty in MOD ─────────────
      if (mod.lengthWords > 0) {
        issues.push(`inst${i + 1}: ${src.type === 'synth' ? 'synth' : 'empty'} → ${mod.lengthWords * 2}B in MOD`);
      }
    }
  }

  return issues;
}

// ── Test case definitions ────────────────────────────────────────────────────

interface TestCase {
  file: string;
  format: string;
  parserModule: string;
  parseFn: string;
  isAsync: boolean;
  args?: 'buffer' | 'bytes'; // buffer = ArrayBuffer, bytes = Uint8Array
  filename?: string; // override filename passed to parser (e.g. for prefix-keyed formats)
}

const TEST_CASES: TestCase[] = [
  // ── Already-validated core formats ───────────────────────────────────────
  { file: '45.okta',             format: 'Oktalyzer',        parserModule: '../src/lib/import/formats/OktalyzerParser',              parseFn: 'parseOktalyzerFile',              isAsync: false, args: 'buffer' },
  { file: 'analogue_vibes.jam',  format: 'JamCracker',       parserModule: '../src/lib/import/formats/JamCrackerParser',             parseFn: 'parseJamCrackerFile',             isAsync: true,  args: 'buffer' },
  { file: 'beast_busters.ims',   format: 'IMS',              parserModule: '../src/lib/import/formats/ImagesMusicSystemParser',      parseFn: 'parseImagesMusicSystemFile',      isAsync: false, args: 'buffer' },
  { file: 'anthrox.fc',          format: 'FutureComposer',   parserModule: '../src/lib/import/formats/FCParser',                    parseFn: 'parseFCFile',                     isAsync: false, args: 'buffer' },
  { file: 'antidust.bp3',        format: 'SoundMon',         parserModule: '../src/lib/import/formats/SoundMonParser',              parseFn: 'parseSoundMonFile',               isAsync: true,  args: 'buffer' },
  { file: 'aquarivs.bp',         format: 'SoundMon',         parserModule: '../src/lib/import/formats/SoundMonParser',              parseFn: 'parseSoundMonFile',               isAsync: true,  args: 'buffer' },
  { file: 'almighty.sa',         format: 'SonicArranger',    parserModule: '../src/lib/import/formats/SonicArrangerParser',         parseFn: 'parseSonicArrangerFile',          isAsync: true,  args: 'buffer' },
  { file: 'synth_corn.emod',     format: 'QuadraComposer',   parserModule: '../src/lib/import/formats/QuadraComposerParser',        parseFn: 'parseQuadraComposerFile',         isAsync: true,  args: 'buffer' },
  { file: 'fantasi8.is',         format: 'InStereo1',        parserModule: '../src/lib/import/formats/InStereo1Parser',             parseFn: 'parseInStereo1File',              isAsync: false, args: 'bytes'  },
  { file: 'stereo_feeling.is20', format: 'InStereo2',        parserModule: '../src/lib/import/formats/InStereo2Parser',             parseFn: 'parseInStereo2File',              isAsync: false, args: 'bytes'  },
  { file: 'anthrox_intro.dm2',   format: 'DeltaMusic2',      parserModule: '../src/lib/import/formats/DeltaMusic2Parser',           parseFn: 'parseDeltaMusic2File',            isAsync: false, args: 'bytes'  },
  { file: 'med.sadman',          format: 'MED',              parserModule: '../src/lib/import/formats/MEDParser',                   parseFn: 'parseMEDFile',                    isAsync: false, args: 'buffer' },

  // ── Additional native-parseable formats ──────────────────────────────────

  // NovoTrade Packer (.ntp)
  // 3rdblock.ntp — D1=0 at offset 16 (detection rejects), UADE-only
  // Jochen Hippel ST (.hip)
  { file: '5th_gear.hip',        format: 'JochenHippelST',   parserModule: '../src/lib/import/formats/JochenHippelSTParser',        parseFn: 'parseJochenHippelSTFile',         isAsync: false, args: 'buffer' },
  // AHX / HivelyTracker (.ahx)
  { file: 'aces_high.ahx',       format: 'AHX',              parserModule: '../src/lib/import/formats/HivelyParser',                parseFn: 'parseHivelyFile',                 isAsync: false, args: 'buffer' },
  // Art of Noise (.aon)
  { file: 'action_section.aon',  format: 'ArtOfNoise',       parserModule: '../src/lib/import/formats/ArtOfNoiseParser',            parseFn: 'parseArtOfNoiseFile',             isAsync: false, args: 'bytes'  },
  // Future Composer SMOD (.smod)
  { file: 'adept.smod',          format: 'FC-SMOD',          parserModule: '../src/lib/import/formats/FCParser',                    parseFn: 'parseFCFile',                     isAsync: false, args: 'buffer' },
  // PreTracker (.prt)
  { file: 'adreamoffish.prt',    format: 'PreTracker',       parserModule: '../src/lib/import/formats/PreTrackerParser',            parseFn: 'parsePreTrackerFile',             isAsync: true,  args: 'buffer' },
  // Dave Lowe (.dl)
  { file: 'afterburner.dl',      format: 'DaveLowe',         parserModule: '../src/lib/import/formats/DaveLoweParser',              parseFn: 'parseDaveLoweFile',               isAsync: true,  args: 'buffer' },
  // Jason Brooke (.jb)
  { file: 'afterburner2.jb',     format: 'JasonBrooke',      parserModule: '../src/lib/import/formats/JasonBrookeParser',           parseFn: 'parseJasonBrookeFile',            isAsync: false, args: 'buffer' },
  // Paul Shields (.ps)
  { file: 'airball.ps',          format: 'PaulShields',      parserModule: '../src/lib/import/formats/PaulShieldsParser',           parseFn: 'parsePaulShieldsFile',            isAsync: false, args: 'buffer' },
  // Jochen Hippel ST (.sog)
  { file: 'airballtest.sog',     format: 'JochenHippelST',   parserModule: '../src/lib/import/formats/JochenHippelSTParser',        parseFn: 'parseJochenHippelSTFile',         isAsync: false, args: 'buffer' },
  // Jochen Hippel 7V (.hip7)
  { file: 'amberstar.hip7',      format: 'JochenHippel7V',   parserModule: '../src/lib/import/formats/JochenHippel7VParser',        parseFn: 'parseJochenHippel7VFile',         isAsync: false, args: 'buffer' },
  // SidMon 1.0 (.sid1)
  { file: 'anarchy.sid1',        format: 'SidMon1',          parserModule: '../src/lib/import/formats/SidMon1Parser',               parseFn: 'parseSidMon1File',                isAsync: false, args: 'buffer' },
  // David Whittaker (.dw)
  { file: 'apb.dw',              format: 'DavidWhittaker',   parserModule: '../src/lib/import/formats/DavidWhittakerParser',        parseFn: 'parseDavidWhittakerFile',         isAsync: false, args: 'buffer' },
  // Ben Daglish (.bd)
  { file: 'artura.bd',           format: 'BenDaglish',       parserModule: '../src/lib/import/formats/BenDaglishParser',            parseFn: 'parseBenDaglishFile',             isAsync: true,  args: 'buffer' },
  // Ashley Hogg (ash.*)
  // ash.cj_in_the_usa — Amiga HUNK executable (bytes[0..1]=0x0000≠0x6000), UADE-only
  // Music Maker 4V (.mm4)
  { file: 'axelf.mm4',           format: 'MusicMaker4V',     parserModule: '../src/lib/import/formats/MusicMakerParser',            parseFn: 'parseMusicMaker4VFile',           isAsync: false, args: 'buffer' },
  // Dave Lowe New (.dln)
  { file: 'balrog.dln',          format: 'DaveLoweNew',      parserModule: '../src/lib/import/formats/DaveLoweNewParser',           parseFn: 'parseDaveLoweNewFile',            isAsync: false, args: 'buffer' },
  // Music Assembler (.ma)
  { file: 'baseheads.ma',        format: 'MusicAssembler',   parserModule: '../src/lib/import/formats/MusicAssemblerParser',        parseFn: 'parseMusicAssemblerFile',         isAsync: false, args: 'bytes'  },
  // Desire (.dsr)
  { file: 'batmanreturns.dsr',   format: 'Desire',           parserModule: '../src/lib/import/formats/DesireParser',                parseFn: 'parseDesireFile',                 isAsync: false, args: 'buffer' },
  // Special FX - DODA (.doda)
  { file: 'batmanthemovie.doda', format: 'SpecialFX',        parserModule: '../src/lib/import/formats/SpecialFXParser',             parseFn: 'parseSpecialFXFile',              isAsync: false, args: 'buffer' },
  // Special FX - JD (.jd)
  { file: 'battlecommand.jd',    format: 'SpecialFX',        parserModule: '../src/lib/import/formats/SpecialFXParser',             parseFn: 'parseSpecialFXFile',              isAsync: false, args: 'buffer' },
  // Rob Hubbard ST (.rho)
  { file: 'battleships.rho',     format: 'RobHubbardST',     parserModule: '../src/lib/import/formats/RobHubbardSTParser',          parseFn: 'parseRobHubbardSTFile',           isAsync: false, args: 'buffer' },
  // Fred Gray (.gray)
  { file: 'blacklamp.gray',      format: 'FredGray',         parserModule: '../src/lib/import/formats/FredGrayParser',              parseFn: 'parseFredGrayFile',               isAsync: false, args: 'buffer' },
  // Janko Mrsic-Flogel (.jmf)
  { file: 'bombjack.jmf',        format: 'JankoMrsicFlogel', parserModule: '../src/lib/import/formats/JankoMrsicFlogelParser',      parseFn: 'parseJankoMrsicFlogelFile',       isAsync: false, args: 'buffer' },
  // SidMon 2 (.sid2)
  { file: 'bruno_time.sid2',     format: 'SidMon2',          parserModule: '../src/lib/import/formats/SidMon2Parser',               parseFn: 'parseSidMon2File',                isAsync: true,  args: 'buffer' },
  // TCB Tracker (.tcb)
  { file: 'cannonfodder.tcb',    format: 'TCBTracker',       parserModule: '../src/lib/import/formats/TCBTrackerParser',            parseFn: 'parseTCBTrackerFile',             isAsync: true,  args: 'buffer' },
  // MMDC (.mmdc)
  { file: 'captain_planet.mmdc', format: 'MMDC',             parserModule: '../src/lib/import/formats/MMDCParser',                  parseFn: 'parseMMDCFile',                   isAsync: false, args: 'buffer' },
  // Ben Daglish SID (.bds)
  { file: 'chubbygristle.bds',   format: 'BenDaglishSID',    parserModule: '../src/lib/import/formats/BenDaglishSIDParser',         parseFn: 'parseBenDaglishSIDFile',          isAsync: true,  args: 'buffer' },
  // Digital Mugician (.mug)
  { file: 'cockwise.mug',        format: 'DigitalMugician',  parserModule: '../src/lib/import/formats/DigitalMugicianParser',       parseFn: 'parseDigitalMugicianFile',        isAsync: true,  args: 'buffer' },
  // Mark Cooksey (.mc)
  { file: 'commando.mc',         format: 'MarkCooksey',      parserModule: '../src/lib/import/formats/MarkCookseyParser',           parseFn: 'parseMarkCookseyFile',            isAsync: true,  args: 'buffer' },
  // Sean Conran (.scr)
  { file: 'count_duckula.scr',   format: 'SeanConran',       parserModule: '../src/lib/import/formats/SeanConranParser',            parseFn: 'parseSeanConranFile',             isAsync: true,  args: 'buffer' },
  // Music Maker 8V (.mm8)
  { file: 'crockett8.mm8',       format: 'MusicMaker8V',     parserModule: '../src/lib/import/formats/MusicMakerParser',            parseFn: 'parseMusicMaker8VFile',           isAsync: false, args: 'buffer' },
  // Delta Music 1 (.dm)
  { file: 'crusaders1.dm',       format: 'DeltaMusic1',      parserModule: '../src/lib/import/formats/DeltaMusic1Parser',           parseFn: 'parseDeltaMusic1File',            isAsync: true,  args: 'buffer' },
  // Sound Master (.sm)
  { file: 'doofus.sm',           format: 'SoundMaster',      parserModule: '../src/lib/import/formats/SoundMasterParser',           parseFn: 'parseSoundMasterFile',            isAsync: true,  args: 'buffer' },
  // Digital Sound Studio (.dss)
  { file: 'doxtro3.dss',         format: 'DigSoundStudio',   parserModule: '../src/lib/import/formats/DigitalSoundStudioParser',    parseFn: 'parseDigitalSoundStudioFile',     isAsync: false, args: 'bytes'  },
  // Digital Sonix & Chrome (.dsc)
  { file: 'dragonsbreath.dsc',   format: 'DigSonixChrome',   parserModule: '../src/lib/import/formats/DigitalSonixChromeParser',    parseFn: 'parseDscFile',                    isAsync: false, args: 'buffer' },
  // Actionamics (.ast)
  { file: 'dynablaster.ast',     format: 'Actionamics',      parserModule: '../src/lib/import/formats/ActionamicsParser',           parseFn: 'parseActionamicsFile',            isAsync: false, args: 'bytes'  },
  // Fashion Tracker (.ex)
  { file: 'fashionating1.ex',    format: 'FashionTracker',   parserModule: '../src/lib/import/formats/FashionTrackerParser',        parseFn: 'parseFashionTrackerFile',         isAsync: false, args: 'buffer' },
  // Kris Hatlelid (.kh)
  { file: 'fiendish_freddys.kh', format: 'KrisHatleLid',     parserModule: '../src/lib/import/formats/KrisHatlelidParser',          parseFn: 'parseKrisHatlelidFile',           isAsync: false, args: 'buffer' },
  // Digital Mugician via .dmu
  { file: 'flight.dmu',          format: 'DigitalMugician',  parserModule: '../src/lib/import/formats/DigitalMugicianParser',       parseFn: 'parseDigitalMugicianFile',        isAsync: true,  args: 'buffer' },
  // Quartet (.sqt)
  { file: 'flimbos_quest.sqt',   format: 'Quartet',          parserModule: '../src/lib/import/formats/QuartetParser',               parseFn: 'parseQuartetFile',                isAsync: true,  args: 'buffer' },
  // GlueMon (.glue)
  { file: 'flood.glue',          format: 'GlueMon',          parserModule: '../src/lib/import/formats/GlueMonParser',               parseFn: 'parseGlueMonFile',                isAsync: false, args: 'buffer' },
  // Future Player (.fp)
  { file: 'hybris.fp',           format: 'FuturePlayer',     parserModule: '../src/lib/import/formats/FuturePlayerParser',          parseFn: 'parseFuturePlayerFile',           isAsync: false, args: 'buffer' },
  // Tomy Tracker (.sg)
  { file: 'inconvenient.sg',     format: 'TomyTracker',      parserModule: '../src/lib/import/formats/TomyTrackerParser',           parseFn: 'parseTomyTrackerFile',            isAsync: false, args: 'buffer' },
  // Mark Cooksey (mco.* prefix)
  { file: 'mco.aquestion',       format: 'MarkCooksey',      parserModule: '../src/lib/import/formats/MarkCookseyParser',           parseFn: 'parseMarkCookseyFile',            isAsync: true,  args: 'buffer' },
  // Steve Turner (.jpo)
  { file: 'offroad.jpo',         format: 'SteveTurner',      parserModule: '../src/lib/import/formats/SteveTurnerParser',           parseFn: 'parseSteveTurnerFile',            isAsync: false, args: 'buffer' },
  // Jochen Hippel CoSo (.hipc)
  { file: 'prehistoric_tale.hipc', format: 'HippelCoSo',     parserModule: '../src/lib/import/formats/HippelCoSoParser',            parseFn: 'parseHippelCoSoFile',             isAsync: true,  args: 'buffer' },
  // Anders 0land (.hot) — parser requires 'hot.' prefix; pass canonical form as filename
  { file: 'primemover.hot',      format: 'Anders0land',      parserModule: '../src/lib/import/formats/Anders0landParser',           parseFn: 'parseAnders0landFile',            isAsync: true,  args: 'buffer', filename: 'hot.primemover' },
  // PSA (.psa)
  { file: 'punisher.psa',        format: 'PSA',              parserModule: '../src/lib/import/formats/PSAParser',                   parseFn: 'parsePSAFile',                    isAsync: false, args: 'buffer' },
  // Core Design (.core)
  { file: 'rick_dangerous.core', format: 'CoreDesign',       parserModule: '../src/lib/import/formats/CoreDesignParser',            parseFn: 'parseCoreDesignFile',             isAsync: false, args: 'buffer' },
  // Rob Hubbard (.rh)
  { file: 'sanxion.rh',          format: 'RobHubbard',       parserModule: '../src/lib/import/formats/RobHubbardParser',            parseFn: 'parseRobHubbardFile',             isAsync: true,  args: 'buffer' },
  // Sound Player (sjs.* prefix)
  { file: 'sjs.awesome',         format: 'SoundPlayer',      parserModule: '../src/lib/import/formats/SoundPlayerParser',           parseFn: 'parseSoundPlayerFile',            isAsync: false, args: 'buffer' },
  // Digital Mugician II (.mug2)
  { file: 'snickle.mug2',        format: 'DigitalMugician2', parserModule: '../src/lib/import/formats/DigitalMugicianParser',       parseFn: 'parseDigitalMugicianFile',        isAsync: true,  args: 'buffer' },
  // David Hanney (.dh)
  { file: 'tearaway.dh',         format: 'DavidHanney',      parserModule: '../src/lib/import/formats/DavidHanneyParser',           parseFn: 'parseDavidHanneyFile',            isAsync: false, args: 'buffer' },
  // Jeroen Tel (.jt)
  { file: 'tusker_ingame.jt',    format: 'JeroenTel',        parserModule: '../src/lib/import/formats/JeroenTelParser',             parseFn: 'parseJeroenTelFile',              isAsync: true,  args: 'buffer' },
  // Wally Beben (.wb)
  { file: 'wicked.wb',           format: 'WallyBeben',       parserModule: '../src/lib/import/formats/WallyBebenParser',            parseFn: 'parseWallyBebenFile',             isAsync: false, args: 'buffer' },
  // Steve Barrett (.sb)
  { file: 'artificial_dreams.sb', format: 'SteveBarrett',   parserModule: '../src/lib/import/formats/SteveBarrettParser',          parseFn: 'parseSteveBarrettFile',           isAsync: false, args: 'buffer' },
  // Peter Verswyvelen Packer (.pvp)
  // ziriax.pvp — sample 2 volume field 0x1a1a=6682 > 64 (detection rejects), UADE-only

  // ── New native-parseable formats ─────────────────────────────────────────

  // Additional MED/OctaMED variants
  { file: 'funky nightmare.mmd1',              format: 'MED',              parserModule: '../src/lib/import/formats/MEDParser',                  parseFn: 'parseMEDFile',                    isAsync: false, args: 'buffer' },
  { file: 'bounty hunter - outro (remixed).mmd3', format: 'MED',          parserModule: '../src/lib/import/formats/MEDParser',                  parseFn: 'parseMEDFile',                    isAsync: false, args: 'buffer' },
  { file: 'universal monsters - dracula.mmd0', format: 'MED',             parserModule: '../src/lib/import/formats/MEDParser',                  parseFn: 'parseMEDFile',                    isAsync: false, args: 'buffer' },

  // Hively Tracker (.hvl)
  { file: 'hexplosion.hvl',                    format: 'Hively',           parserModule: '../src/lib/import/formats/HivelyParser',               parseFn: 'parseHivelyFile',                 isAsync: false, args: 'buffer' },

  // DigiBooster Pro (.dbm) — native DBMX/DBM0 parser
  { file: 'invisibility.dbm',                  format: 'DigiBoosterPro',   parserModule: '../src/lib/import/formats/DigiBoosterParser',          parseFn: 'parseDigiBoosterFile',            isAsync: false, args: 'buffer' },

  // Additional Mark Cooksey (mco.* prefix)
  { file: 'mco.overlander',                    format: 'MarkCooksey',      parserModule: '../src/lib/import/formats/MarkCookseyParser',          parseFn: 'parseMarkCookseyFile',            isAsync: true,  args: 'buffer' },

  // Kris Hatlelid (kris.* prefix)
  { file: 'kris.hatlelid-songplay',            format: 'KrisHatlelid',     parserModule: '../src/lib/import/formats/KRISParser',                 parseFn: 'parseKRISFile',                   isAsync: true,  args: 'buffer' },

  // Jesper Olsen (.jo)
  { file: 'lollypop-subgame 01.jo',            format: 'JesperOlsen',      parserModule: '../src/lib/import/formats/JesperOlsenParser',          parseFn: 'parseJesperOlsenFile',            isAsync: false, args: 'buffer' },

  // Custom Made (.cm, .rk)
  { file: 'the viking child crack.cm',         format: 'CustomMade',       parserModule: '../src/lib/import/formats/CustomMadeParser',           parseFn: 'parseCustomMadeFile',             isAsync: true,  args: 'buffer' },

  // MusicLine (.ml)
  { file: 'rush.ml',                           format: 'MusicLine',        parserModule: '../src/lib/import/formats/MusicLineParser',            parseFn: 'parseMusicLineFile',              isAsync: false, args: 'bytes'  },

  // PC tracker formats — native parsers
  { file: 'a sleep so deep.mod',               format: 'MOD',              parserModule: '../src/lib/import/formats/MODParser',                  parseFn: 'parseMODFile',                    isAsync: true,  args: 'buffer' },
  { file: 'flo boarding - level 1.xm',         format: 'XM',               parserModule: '../src/lib/import/formats/XMParser',                   parseFn: 'parseXMFile',                     isAsync: true,  args: 'buffer' },
  { file: 'absm chain mod.it',                 format: 'IT',               parserModule: '../src/lib/import/formats/ITParser',                   parseFn: 'parseITFile',                     isAsync: false, args: 'buffer' },
  { file: 'andante.s3m',                       format: 'S3M',              parserModule: '../src/lib/import/formats/S3MParser',                  parseFn: 'parseS3MFile',                    isAsync: false, args: 'buffer' },
  { file: 'nightmare on acid.s3m',             format: 'S3M',              parserModule: '../src/lib/import/formats/S3MParser',                  parseFn: 'parseS3MFile',                    isAsync: false, args: 'buffer' },
  { file: '96 tears.unic',                     format: 'UNIC',             parserModule: '../src/lib/import/formats/UNICParser',                 parseFn: 'parseUNICFile',                   isAsync: true,  args: 'buffer' },
  { file: 'anonymous in 4ce.mtm',              format: 'MTM',              parserModule: '../src/lib/import/formats/MTMParser',                  parseFn: 'parseMTMFile',                    isAsync: true,  args: 'buffer' },
  { file: 'm31.far',                           format: 'FAR',              parserModule: '../src/lib/import/formats/FARParser',                  parseFn: 'parseFARFile',                    isAsync: true,  args: 'buffer' },
  { file: 'seasons.ult',                       format: 'ULT',              parserModule: '../src/lib/import/formats/ULTParser',                  parseFn: 'parseULTFile',                    isAsync: true,  args: 'buffer' },
  { file: 'Silver-Song0.psm',                  format: 'PSM',              parserModule: '../src/lib/import/formats/PSMParser',                  parseFn: 'parsePSMFile',                    isAsync: false, args: 'bytes'  },
  { file: 'slideshow i.stm',                   format: 'STM',              parserModule: '../src/lib/import/formats/STMParser',                  parseFn: 'parseSTMFile',                    isAsync: true,  args: 'buffer' },
  { file: 'tilbury fair (remix).gdm',          format: 'GDM',              parserModule: '../src/lib/import/formats/GDMParser',                  parseFn: 'parseGDMFile',                    isAsync: true,  args: 'buffer' },
  { file: 'fonetag.669',                       format: '669',              parserModule: '../src/lib/import/formats/Format669Parser',            parseFn: 'parse669File',                    isAsync: true,  args: 'buffer' },

  // ── UADE-only formats — no native pattern data, skip ─────────────────────
  // agony.aam       — ArtAndMagic (aam. prefix, UADE-only)
  // alien_storm.md  — MikeDavies (UADE classic)
  // angel_harp.mms  — MultiMediaSound (UADE editable)
  // aspar.fred      — FredEditor (UADE classic)
  // atmos.mso       — Medley (UADE editable)
  // atron.mk2       — MarkII (mk2. prefix, UADE-only)
  // ballade.ems     — EMS (ems. prefix, UADE-only)
  // bladerunner.ea  — EarAche (ea. prefix, UADE-only)
  // blazing_thunder.hd — HowieDavies (hd. prefix, UADE-only)
  // bombfusion.riff — RiffRaff (riff. prefix, UADE-only)
  // boulderdash.spl — SoundProgrammingLanguage (spl. prefix, UADE-only)
  // chinese_chess.mon / gyroscope.mon — ManiacsOfNoise (UADE-only)
  // chuckie_egg.tw  — SoundImages (tw. prefix, UADE-only)
  // crash_and_burn.dz — DariusZendeh (dz. prefix, UADE-only)
  // digital_voyage.sas — SonicArrangerStars (sas. prefix, UADE-only)
  // dns.hollywoodpokerpro — DynamicSynthesizer (dns. prefix, UADE-only)
  // fightingsoccer.snk — PaulSummers (UADE classic)
  // forgotten_worlds.fw — ForgottenWorlds (fw. prefix, UADE-only)
  // krymini.amc     — AM-Composer (.amc, UADE-only)
  // lefetichemaya.mok — Silmarils (mok. prefix, UADE-only)
  // letsdance.bss   — BeathovenSynthesizer (bss. prefix, UADE-only)
  // maniac_mansion.scumm — SCUMM (scumm. prefix, UADE-only)
  // newtek.bsi      — FutureComposer-BSI (bsi. prefix, UADE-only)
  // ninjaspirit.lme — LegglessMusic (UADE classic)
  // qang.vss        — VoodooSupremeSynthesizer (vss. prefix, UADE-only)
  // salten_crackers.synmod — SynTracker (synmod. prefix, UADE-only)
  // surf_ninjas.scn — SeanConnolly (scn. prefix, UADE-only)
  // theday.digi     — old DigiBooster (no DBM0 magic, no parser)
  // turtle_ready.adsc — AudioSculpture (.adsc, UADE-only)
  // action.aps      — AProSys (.aps, UADE-only)
  // axelf.psf       — SoundFactory (.psf, UADE classic)
];

// ── Comparison helpers ───────────────────────────────────────────────────────

interface SourceCell {
  note: number;
  instrument: number;
  effTyp: number;
  eff: number;
}

// MOD export period table covers C-1..B-4 = XM notes 13..60.
// Notes above B-4 are silenced in export — expected behavior, not bugs.
const MOD_NOTE_MIN = 13; // C-1
const MOD_NOTE_MAX = 60; // B-4

function compareCells(src: SourceCell, mod: MODCell, ch: number, row: number): string | null {
  // Empty in both → OK
  if (src.note === 0 && mod.period === 0) return null;
  // Note off → ignore
  if (src.note === 97) return null;
  // Source note out of standard PT range → expected to be silenced or resampled, skip
  if (src.note > 0 && (src.note < MOD_NOTE_MIN || src.note > MOD_NOTE_MAX)) return null;
  // Source has in-range note but MOD doesn't
  if (src.note >= MOD_NOTE_MIN && src.note <= MOD_NOTE_MAX && mod.period === 0) {
    return `ch${ch} row${row}: src=${xmNoteToStr(src.note)} mod=--- (note lost!)`;
  }
  if (src.note === 0 && mod.period > 0) {
    return `ch${ch} row${row}: src=--- mod=${xmNoteToStr(mod.xmNote)} (phantom note)`;
  }
  // Both have note — check octave/semitone (allow ±1 for period rounding)
  if (src.note > 0 && mod.period > 0 && Math.abs(src.note - mod.xmNote) > 1) {
    return `ch${ch} row${row}: note ${xmNoteToStr(src.note)}(${src.note}) → ${xmNoteToStr(mod.xmNote)}(${mod.xmNote}) MISMATCH`;
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runTest(tc: TestCase, outDir?: string): Promise<void> {
  const filePath = join(TEST_DIR, tc.file);
  if (!existsSync(filePath)) {
    console.log(`  SKIP  ${tc.file} (not found)`);
    return;
  }

  const fileData = readFileSync(filePath);
  const buffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer;

  // ── Parse source format ──────────────────────────────────────────────────
  let song: import('../src/engine/TrackerReplayer').TrackerSong;
  try {
    const mod = await import(tc.parserModule);
    const parseFnActual = mod[tc.parseFn];
    if (!parseFnActual) throw new Error(`No export '${tc.parseFn}'`);
    const arg = tc.args === 'bytes' ? new Uint8Array(buffer) : buffer;
    const parserFilename = tc.filename ?? tc.file;
    const result = tc.isAsync ? await parseFnActual(arg, parserFilename) : parseFnActual(arg, parserFilename);
    if (!result) throw new Error('Parser returned null/undefined');
    song = result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR ${tc.file} (parse failed): ${msg.substring(0, 120)}`);
    return;
  }

  // ── Skip UADE-backed formats with no pattern data ────────────────────────
  const hasNotes = (song.patterns ?? []).some(pat =>
    (pat.channels ?? []).some(ch => (ch.rows ?? []).some(row => row.note > 0))
  );
  if (!hasNotes) {
    console.log(`  SKIP  ${tc.format.padEnd(16)} ${tc.file.padEnd(30)} (no pattern data — UADE-only)`);
    return;
  }

  // ── Bake synths once (used for both exports and instrument comparison) ──────
  const { exportSongToMOD, bakeAllSynthInstruments } = await import('../src/lib/export/modExport');
  const bakedSong = await bakeAllSynthInstruments(song);

  // ── Export to MOD ────────────────────────────────────────────────────────
  let modBytes: ArrayBuffer;
  let modMagic = '';
  try {
    // bakeSynths:false — already baked above
    const result = await exportSongToMOD(bakedSong, { bakeSynths: false });
    modBytes = await result.blob.arrayBuffer();
    modMagic = Buffer.from(modBytes).slice(1080, 1084).toString('ascii');

    if (result.warnings.length > 0) {
      console.log(`  WARN  ${tc.file}: ${result.warnings.length} warning(s)`);
      for (const w of result.warnings.slice(0, 5)) console.log(`        ${w}`);
    }

    if (outDir) {
      if (modMagic === 'M.K.') {
        // 4-channel ProTracker — save as .mod
        const outName = basename(tc.file).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_') + '.mod';
        const outPath = join(outDir, outName);
        writeFileSync(outPath, Buffer.from(modBytes));
        console.log(`  SAVE  ${outPath}`);
      } else {
        // Multi-channel — export as XM (MilkyTracker / OpenMPT compatible)
        const { exportAsXM } = await import('../src/lib/export/XMExporter');
        const xmResult = await exportAsXM(bakedSong.patterns, bakedSong.instruments, {
          moduleName: bakedSong.name || tc.file,
          defaultSpeed: bakedSong.initialSpeed,
          defaultBPM: bakedSong.initialBPM,
          channelLimit: Math.min(bakedSong.numChannels ?? 4, 32),
          bakeSynthsToSamples: false, // already baked
        });
        const outName = basename(tc.file).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_') + '.xm';
        const outPath = join(outDir, outName);
        writeFileSync(outPath, Buffer.from(await xmResult.data.arrayBuffer()));
        console.log(`  SAVE  ${outPath}${xmResult.warnings.length > 0 ? ` (${xmResult.warnings.length} xm warnings)` : ''}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR ${tc.file} (export failed): ${msg.substring(0, 120)}`);
    return;
  }

  // ── Parse MOD back ───────────────────────────────────────────────────────
  let modFile: MODFile;
  try {
    modFile = parseMOD(modBytes);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR ${tc.file} (MOD parse failed): ${msg.substring(0, 120)}`);
    return;
  }

  // ── Compare patterns (MOD round-trip, first 4 patterns × 4 channels) ─────
  const mismatches: string[] = [];
  let totalNotes = 0;
  let matchedNotes = 0;

  const srcPatterns = bakedSong.patterns ?? [];
  const numPats = Math.min(srcPatterns.length, modFile.numPatterns, 4); // check first 4 patterns
  const numCh = Math.min(bakedSong.numChannels ?? 4, modFile.numChannels, 4);

  for (let p = 0; p < numPats; p++) {
    const srcPat = srcPatterns[p];
    // Export maps song.patterns[i] → MOD pattern i directly (order list is separate)
    const modPat = modFile.patterns[p];
    if (!srcPat || !modPat) continue;

    const srcChannels = srcPat.channels ?? [];
    for (let ch = 0; ch < numCh; ch++) {
      const srcCh = srcChannels[ch];
      if (!srcCh) continue;
      const srcRows = srcCh.rows ?? [];
      const numRows = Math.min(srcRows.length, 64);

      for (let row = 0; row < numRows; row++) {
        const srcCell = srcRows[row];
        const modCell = modPat.rows[row]?.[ch];
        if (!srcCell || !modCell) continue;

        // Only count in-range notes for match percentage
        if (srcCell.note >= MOD_NOTE_MIN && srcCell.note <= MOD_NOTE_MAX) totalNotes++;

        const err = compareCells(
          { note: srcCell.note, instrument: srcCell.instrument ?? 0, effTyp: srcCell.effTyp ?? 0, eff: srcCell.eff ?? 0 },
          modCell,
          ch,
          row,
        );
        if (err) {
          if (mismatches.length < 10) mismatches.push(`pat${p} ${err}`);
        } else if (srcCell.note >= MOD_NOTE_MIN && srcCell.note <= MOD_NOTE_MAX) {
          matchedNotes++;
        }
      }
    }
  }

  // ── Compare instruments ───────────────────────────────────────────────────
  const instIssues = compareInstruments(bakedSong, modFile);

  const pct = totalNotes > 0 ? Math.round((matchedNotes / totalNotes) * 100) : 100;
  const allOk = mismatches.length === 0 && instIssues.length === 0;
  const status = allOk ? 'PASS ' : (pct >= 90 && instIssues.length === 0 ? 'WARN ' : 'FAIL ');

  // Count sample vs unbaked-synth instruments in the baked song (up to 31)
  const srcInsts = (bakedSong.instruments ?? []).slice(0, 31);
  const nSample = srcInsts.filter(i => !!(i.sample?.audioBuffer && (i.sample.audioBuffer as ArrayBuffer).byteLength > 44)).length;
  const nSynth  = srcInsts.length - nSample;
  const instSummary = nSynth > 0 ? `${nSample}smp+${nSynth}syn` : `${nSample}smp`;
  const fmtTag = modMagic === 'M.K.' ? 'mod' : 'xm ';

  console.log(
    `  ${status} ${tc.format.padEnd(16)} ${tc.file.padEnd(30)} [${fmtTag}] notes=${totalNotes} match=${pct}% insts=${instSummary}${instIssues.length > 0 ? ' !' : ''}`,
  );
  for (const m of mismatches) console.log(`        ${m}`);
  for (const m of instIssues.slice(0, 5)) console.log(`        [inst] ${m}`);
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx !== -1 ? args[outIdx + 1] : undefined;
const filterArgs = args.filter((a, i) => a !== '--out' && i !== outIdx + 1);
const filter = filterArgs[0];

if (outDir) mkdirSync(outDir, { recursive: true });

const cases = filter
  ? TEST_CASES.filter(tc => tc.file.includes(filter) || tc.format.toLowerCase().includes(filter.toLowerCase()))
  : TEST_CASES;

console.log(`\nMOD Export Pattern Accuracy Test`);
console.log(`${'='.repeat(72)}`);
console.log(`Testing ${cases.length} format(s), comparing first 4 patterns × 4 channels`);
console.log(`(${TEST_CASES.length} total cases; UADE-only formats skipped)`);
if (outDir) console.log(`Saving MOD files to: ${outDir}`);
console.log();

for (const tc of cases) {
  await runTest(tc, outDir);
}

console.log(`\nDone.`);
