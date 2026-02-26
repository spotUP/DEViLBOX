/**
 * ModuleLoader - Loads and parses tracker module files (MOD, XM, IT, S3M)
 * Uses native parsers (XM/MOD) for full sample/envelope extraction
 * Falls back to libopenmpt for other formats (IT, S3M, etc.)
 */

import { ChiptunePlayer } from './ChiptunePlayer';
import { parseXM } from './formats/XMParser';
import { parseMOD } from './formats/MODParser';
import { parseFurnaceSong, convertFurnaceToDevilbox } from './formats/FurnaceSongParser';
import { DefleMaskParser, type DMFModule } from './formats/DefleMaskParser';
import { FurnaceDispatchEngine } from '@engine/furnace-dispatch/FurnaceDispatchEngine';
import type { ParsedInstrument, ImportMetadata } from '../../types/tracker';

// Raw pattern cell data from libopenmpt
// Command indices: 0=NOTE, 1=INSTRUMENT, 2=VOLUMEEFFECT, 3=EFFECT, 4=VOLUME, 5=PARAMETER
export type RawPatternCell = [number, number, number, number, number, number];

export interface RawPatternRow {
  // Array of channels, each channel is a RawPatternCell
  channels: RawPatternCell[];
}

export interface RawPattern {
  name: string;
  rows: RawPatternCell[][]; // rows[rowIndex][channelIndex] = cell
}

export interface RawSongData {
  channels: string[];
  instruments: string[];
  samples: string[];
  orders: { name: string; pat: number }[];
  patterns: RawPattern[];
  numSubsongs: number;
}

export interface ModuleMetadata {
  title: string;
  type: string;
  channels: number;
  patterns: number;
  orders: number;
  instruments: number;
  samples: number;
  duration: number;
  message?: string;
  song?: RawSongData; // Full pattern data for import
}

export interface ModuleInfo {
  metadata: ModuleMetadata;
  arrayBuffer: ArrayBuffer;
  player?: ChiptunePlayer;  // Optional for formats not supported by libopenmpt (e.g., .fur)
  file: File;  // Original file for sample extraction
  // Native parser data (if available)
  nativeData?: {
    format: 'XM' | 'MOD' | 'FUR' | 'DMF';
    importMetadata: ImportMetadata;
    instruments: ParsedInstrument[];
    patterns: unknown[][];  // XMNote[][] or MODNote[][] or converted patterns
  };
}

/** Error payload from ChiptunePlayer */
interface ChiptuneError {
  type?: string;
  message?: string;
}

/**
 * Load a module file and extract metadata
 * Tries native parser first for XM/MOD, falls back to libopenmpt
 */
export async function loadModuleFile(file: File): Promise<ModuleInfo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) {
        reject(new Error('Failed to read file'));
        return;
      }

      // Determine file type
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      const useNativeParser = ext === '.xm' || ext === '.mod' || ext === '.fur' || ext === '.dmf';

      try {
        // Try native parser for XM/MOD
        if (useNativeParser) {
          console.log('[ModuleLoader] Trying native parser for', ext);
          try {
            const nativeData = await loadWithNativeParser(arrayBuffer, ext);
            console.log('[ModuleLoader] Native parser result:', {
              hasData: !!nativeData,
              format: nativeData?.format,
              patternsCount: nativeData?.patterns?.length,
            });
            if (nativeData) {
              // Create metadata for compatibility
              const metadata: ModuleMetadata = {
                title: nativeData.importMetadata.sourceFile,
                type: ext === '.fur' ? 'Furnace' : ext === '.dmf' ? 'DefleMask' : nativeData.format,
                channels: nativeData.importMetadata.originalChannelCount,
                patterns: nativeData.importMetadata.originalPatternCount,
                orders: nativeData.importMetadata.modData?.songLength || 1,
                instruments: nativeData.importMetadata.originalInstrumentCount,
                samples: nativeData.importMetadata.originalInstrumentCount,
                duration: 0,
                message: nativeData.importMetadata.modData?.songMessage,
              };

              // Load with libopenmpt for playback (skip for formats not supported by libopenmpt)
              let player: ChiptunePlayer | undefined;
              if (ext !== '.fur' && ext !== '.dmf') {
                player = await loadWithLibopenmpt(arrayBuffer);
              }

              resolve({
                metadata,
                arrayBuffer,
                player,
                file,
                nativeData,
              });
              return;
            }
          } catch (nativeError) {
            console.warn(`[ModuleLoader] Native parser failed:`, nativeError);
            // Don't fall back to libopenmpt for formats it doesn't support
            if (ext === '.fur' || ext === '.dmf') {
              reject(new Error(`Failed to parse ${ext} file: ${nativeError instanceof Error ? nativeError.message : 'unknown error'}`));
              return;
            }
            console.log('[ModuleLoader] Falling back to libopenmpt...');
          }
        }

        // Fall back to libopenmpt (only for supported formats)
        const player = await loadWithLibopenmpt(arrayBuffer);

        // Set up metadata handler
        const metadata = await new Promise<ModuleMetadata>((metaResolve, metaReject) => {
          const timeout = setTimeout(() => {
            metaReject(new Error('Timeout waiting for metadata'));
          }, 5000);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          player.onMetadata((meta: any) => {
            clearTimeout(timeout);

            // Extract song data if available
            let song: RawSongData | undefined;
            if (meta.song) {
              song = {
                channels: meta.song.channels || [],
                instruments: meta.song.instruments || [],
                samples: meta.song.samples || [],
                orders: meta.song.orders || [],
                patterns: meta.song.patterns || [],
                numSubsongs: meta.song.numSubsongs || 1,
              };
            }

            metaResolve({
              title: meta.title || file.name.replace(/\.[^/.]+$/, ''),
              type: meta.type || 'Unknown',
              channels: meta.song?.channels?.length || meta.channels || 4,
              patterns: meta.song?.patterns?.length || meta.totalPatterns || meta.patterns || 1,
              orders: meta.song?.orders?.length || meta.totalOrders || meta.orders || 1,
              instruments: meta.song?.instruments?.length || meta.instruments || 0,
              samples: meta.song?.samples?.length || meta.samples || 0,
              duration: meta.dur || 0,
              message: meta.message,
              song,
            });
          });

          player.onError((err: ChiptuneError) => {
            clearTimeout(timeout);
            metaReject(new Error(`Failed to load module: ${err.type || err.message || 'unknown error'}`));
          });
        });

        resolve({
          metadata,
          arrayBuffer,
          player,
          file,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Preview a loaded module (play audio)
 */
export async function previewModule(info: ModuleInfo): Promise<void> {
  if (info.player) {
    await info.player.play(info.arrayBuffer);
  }
}

/**
 * Stop module preview
 */
export function stopPreview(info: ModuleInfo): void {
  if (info.player) {
    info.player.stop();
  }
}

/**
 * Load using native parser (XM or MOD)
 */
async function loadWithNativeParser(
  buffer: ArrayBuffer,
  ext: string
): Promise<ModuleInfo['nativeData'] | null> {
  try {
    if (ext === '.xm') {
      const result = await parseXM(buffer);
      return {
        format: 'XM',
        importMetadata: result.metadata,
        instruments: result.instruments,
        patterns: result.patterns as unknown[][],
      };
    } else if (ext === '.mod') {
      const result = await parseMOD(buffer);
      return {
        format: 'MOD',
        importMetadata: result.metadata,
        instruments: result.instruments,
        patterns: result.patterns as unknown[][],
      };
    } else if (ext === '.fur') {
      console.log('[ModuleLoader] Parsing Furnace file...');
      const module = await parseFurnaceSong(buffer);
      const result = convertFurnaceToDevilbox(module);
      console.log('[ModuleLoader] Furnace parse complete:', {
        instruments: result.instruments.length,
        patterns: result.patterns.length,
        channels: result.metadata.originalChannelCount,
      });

      // Wire compatFlags to effect router
      if (result.metadata.furnaceData?.compatFlags) {
        try {
          const engine = FurnaceDispatchEngine.getInstance();
          const effectRouter = engine.getEffectRouter();
          effectRouter.setCompatFlags(result.metadata);
          console.log('[ModuleLoader] CompatFlags wired to effect router');
        } catch (error) {
          console.warn('[ModuleLoader] Failed to wire compatFlags:', error);
        }
      }

      return {
        format: 'FUR', // Furnace format - patterns already converted
        importMetadata: result.metadata,
        instruments: result.instruments,
        patterns: result.patterns as unknown[][],
      };
    } else if (ext === '.dmf') {
      console.log('[ModuleLoader] Parsing DefleMask file...');
      const dmfModule = DefleMaskParser.parse(buffer, 'dmf') as DMFModule;
      const result = convertDefleMaskToDevilbox(dmfModule);
      console.log('[ModuleLoader] DefleMask parse complete:', {
        instruments: result.instruments.length,
        patterns: result.patterns.length,
        channels: result.metadata.originalChannelCount,
      });
      return {
        format: 'DMF', // DefleMask format - patterns already converted
        importMetadata: result.metadata,
        instruments: result.instruments,
        patterns: result.patterns as unknown[][],
      };
    }
  } catch (error) {
    console.error('[ModuleLoader] Native parser error:', error);
    return null;
  }
  return null;
}

/**
 * Load using libopenmpt (legacy path)
 */
async function loadWithLibopenmpt(
  arrayBuffer: ArrayBuffer
): Promise<ChiptunePlayer> {
  const player = new ChiptunePlayer({
    repeatCount: 0, // Don't loop
  });

  // Wait for player initialization with timeout and error handling
  const initSuccess = await new Promise<boolean>((initResolve) => {
    const timeout = setTimeout(() => {
      console.warn('[ModuleLoader] ChiptunePlayer initialization timed out');
      initResolve(false);
    }, 10000);

    player.onInitialized(() => {
      clearTimeout(timeout);
      initResolve(true);
    });

    player.onError((err: ChiptuneError) => {
      if (err.type === 'init') {
        clearTimeout(timeout);
        initResolve(false);
      }
    });
  });

  if (!initSuccess) {
    throw new Error('Module player not available. The audio worklet failed to load.');
  }

  // Load the file
  await player.play(arrayBuffer);

  // Stop playback (we just wanted metadata)
  player.stop();

  return player;
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return [
    // ── libopenmpt formats ──────────────────────────────────────────────────
    '.mod', '.xm', '.it', '.s3m', '.mptm',
    '.669', '.amf', '.ams', '.dbm', '.dmf',
    '.dsm', '.far', '.ftm', '.gdm', '.imf',
    '.j2b', '.m15', '.mdl', '.mt2',
    '.mtm', '.psm', '.pt36', '.ptm',
    '.sfx2', '.stk', '.stm', '.stp', '.stx',
    '.symmod', '.ult', '.umx',
    // ── Furnace tracker ─────────────────────────────────────────────────────
    '.fur',
    // ── HivelyTracker / AHX ─────────────────────────────────────────────────
    '.hvl', '.ahx',
    // ── Dedicated parsers ───────────────────────────────────────────────────
    '.okt', '.med', '.mmd0', '.mmd1', '.mmd2', '.mmd3',
    '.digi',
    '.fc', '.fc13', '.fc14', '.sfc',
    // ── UADE exotic Amiga formats (130+ via 68k emulation) ──────────────────
    '.fc2', '.fc3', '.fc4', '.smod',
    '.hip', '.hip7', '.sog', '.s7g', '.hipc', '.hst', '.soc', '.coso',
    '.tfmx', '.mdat', '.tfmxpro', '.tfhd1.5', '.tfhd7v', '.tfhdpro',
    '.fred', '.gray',
    '.sm', '.sm1', '.sm2', '.sm3', '.smpro',
    '.bd', '.bds',
    '.dw', '.dwold',
    '.mc', '.mcr', '.mco',
    '.jp', '.jpn', '.jpnd',
    '.rj', '.rjp',
    '.dm', '.dm1', '.dm2', '.dlm1', '.dlm2',
    '.sa', '.sa-p', '.sa_old', '.sonic', '.lion',
    '.abk', '.aam', '.aon', '.aon4', '.aon8', '.adpcm',
    '.bss', '.bfc', '.bsi',
    '.core', '.cin',
    '.dl', '.dl_deli', '.dln',
    '.ea', '.mg',
    '.fp', '.fw',
    '.gmc', '.gm', '.glue',
    '.hd',
    '.ims',
    '.jam', '.jc',
    '.kris', '.kh',
    '.lme',
    '.ma', '.max',
    '.mdst', '.mkii', '.mk2', '.mkiio',
    '.ntp',
    '.osp',
    '.ps', '.psf',
    '.pt', '.ptm',
    '.puma',
    '.rh', '.rhp', '.rho', '.riff',
    '.sas', '.sb', '.scr', '.sdr', '.sg',
    '.snk', '.ss',
    '.st26', '.sun', '.syn',
    '.tpu', '.tcb',
    '.ufo', '.mus',
    '.wn', '.wb',
    '.ym', '.ymst',
    '.sid', '.sid1', '.sid2', '.smn',
    '.bp', '.bp3', '.sndmon',
    '.sfx', '.sfx13', '.sfx20',
    '.mms', '.smus', '.snx',
    '.agi', '.vss', '.ml',
    '.sng', '.qpa', '.qts', '.sqt',
    '.ash', '.aps', '.ast', '.alp', '.amc',
    '.dsc', '.dsr', '.dss', '.dns', '.dmu', '.dmu2',
    '.ems', '.emsv6', '.emod',
    '.jmf', '.jo', '.js', '.jb', '.jcb', '.jcbo', '.jd', '.jt',
    '.kim', '.mon', '.mon_old', '.mfp', '.mosh', '.mmdc',
    '.mug', '.mug2', '.mm4', '.mm8',
    '.psa', '.prt', '.pn', '.pap', '.pvp', '.pat',
    '.sc', '.sct', '.scn', '.scumm',
    '.sjs', '.spl', '.syn', '.synmod',
    '.tf', '.thm', '.tmk', '.tme',
    '.dp', '.trc', '.tro', '.tronic',
    '.dat', '.dum', '.doda', '.dz',
    '.ex', '.cm', '.cus', '.cust', '.custom',
    '.hot', '.bye', '.one', '.two',
    '.avp', '.mw', '.md', '.mok',
    '.tiny', '.sdata', '.npp',
    '.is', '.is20',
    '.jpo', '.jpold',
    '.powt', '.hn', '.mtp2', '.thn', '.arp',
    '.tits', '.mcmd', '.mcmd_org',
    // Prowiz packed module variants
    '.ac1', '.ac1d', '.aval', '.chan', '.cp', '.cplx', '.crb',
    '.di', '.eu', '.fc-m', '.fcm', '.ft', '.fuz', '.fuzz',
    '.gv', '.hmc', '.hrt', '.ice', '.it1',
    '.kef', '.kef7', '.krs', '.ksm', '.lax',
    '.mexxmp', '.mpro', '.np', '.np1', '.np2', '.np3', '.nr', '.nru', '.ntpk',
    '.p10', '.p21', '.p30', '.p40a', '.p40b', '.p41a', '.p4x',
    '.p50a', '.p5a', '.p5x', '.p60', '.p60a', '.p61', '.p61a', '.p6x',
    '.pha', '.pin', '.pm', '.pm0', '.pm01', '.pm1', '.pm10c', '.pm18a',
    '.pm2', '.pm20', '.pm4', '.pm40', '.pmz', '.polk',
    '.pp10', '.pp20', '.pp21', '.pp30', '.ppk',
    '.pr1', '.pr2', '.prom', '.pru', '.pru1', '.pru2',
    '.prun', '.prun1', '.prun2', '.pwr',
    '.pyg', '.pygm', '.pygmy', '.skt', '.skyt', '.snt',
    '.st', '.st2', '.st30', '.star', '.stpk',
    '.tp', '.tp1', '.tp2', '.tp3', '.un2', '.unic', '.unic2',
    '.wn', '.xan', '.xann', '.zen',
    '.mod_doc', '.mod15', '.mod15_mst', '.mod_ntk', '.mod_ntk1', '.mod_ntk2',
    '.mod_ntkamp', '.mod_flt4', '.mod_comp', '.mod15_ust', '.mod15_st-iv',
    '.mod3',
    // ── Compressed/Packed formats ───────────────────────────────────────────
    // ── Additional native-parser formats ────────────────────────────────────
    '.gt2', '.gtk',    // Graoumf Tracker 2
    '.dsym',           // Digital Symphony
    '.cba',            // Chuck Biscuits Atari ST
    '.act',            // Actionamics
    '.c67',            // CDFM Composer 670
    '.667',            // Composer 667
    '.fmt',            // FM Tracker (Davey W Taylor)
    // ── Compressed/Packed formats ───────────────────────────────────────────
    '.zip', '.lha', '.rar', '.gz', '.mmcmp', '.xpk', '.pp', '.pack',
    // ── Chip-dump / CPU-code formats ────────────────────────────────────────
    '.vgm', '.vgz',    // Video Game Music (OPN2/OPL/SN register dumps)
    '.nsf', '.nsfe',   // NES Sound Format (2A03 + expansion chips)
    '.sap',            // Atari 8-bit POKEY
    '.ay',             // ZX Spectrum AY (ZXAYEMUL)
    // Note: .ym and .sid already listed above (previously UADE, now native)
  ];
}

/**
 * Check if a file is a supported module format.
 * Also accepts any file — UADE can detect formats by magic bytes.
 */
export function isSupportedModule(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return getSupportedExtensions().includes(ext);
}

/** Converted DMF cell in XM-compatible format */
interface DMFConvertedCell {
  note: number;
  instrument: number;
  volume: number;
  effectType: number;
  effectParam: number;
}

/**
 * Convert DefleMask module to DEViLBOX format
 */
function convertDefleMaskToDevilbox(dmf: DMFModule): {
  instruments: ParsedInstrument[];
  patterns: DMFConvertedCell[][][]; // [pattern][row][channel]
  metadata: ImportMetadata;
} {
  // Convert instruments
  const instruments: ParsedInstrument[] = dmf.instruments.map((inst, idx) => ({
    id: idx + 1,
    name: inst.name || `Instrument ${idx + 1}`,
    samples: [], // DefleMask uses FM/PSG synthesis, not samples
    fadeout: 0,
    volumeType: 'none' as const,
    panningType: 'none' as const,
  }));

  // Convert patterns using the pattern matrix
  // DefleMask stores patterns per-channel, we need to combine them
  // Pattern storage: patterns[ch * matrixRows + matrixPos]
  // Each pattern has rows[row][ch] with the note data
  const patterns: DMFConvertedCell[][][] = [];

  for (let matrixPos = 0; matrixPos < dmf.matrixRows; matrixPos++) {
    const patternRows: DMFConvertedCell[][] = [];

    for (let row = 0; row < dmf.patternRows; row++) {
      const rowCells: DMFConvertedCell[] = [];

      for (let ch = 0; ch < dmf.channelCount; ch++) {
        // Get the pattern index used at this matrix position for this channel
        const patIdx = dmf.patternMatrix[ch]?.[matrixPos] || 0;

        // Calculate flat pattern array index
        // Patterns are stored: all patterns for ch0, then all for ch1, etc.
        const patternOffset = ch * dmf.matrixRows + patIdx;
        const pattern = dmf.patterns[patternOffset];

        // Get the note at this row for this channel
        const dmfNote = pattern?.rows?.[row]?.[ch];
        if (dmfNote) {
          rowCells.push(convertDMFCell(dmfNote));
        } else {
          rowCells.push({
            note: 0,
            instrument: 0,
            volume: 0,
            effectType: 0,
            effectParam: 0,
          });
        }
      }

      patternRows.push(rowCells);
    }

    patterns.push(patternRows);
  }

  // Calculate BPM from DefleMask timing
  // DefleMask: BPM = (Hz * 2.5) / (timeBase + 1) / ticksPerRow[0]
  const hz = 60; // Default to NTSC
  const bpm = Math.round((hz * 2.5) / (dmf.timeBase + 1) / dmf.ticksPerRow[0] * 4);

  const metadata: ImportMetadata = {
    sourceFormat: 'XM', // Use XM for effect handling compatibility
    sourceFile: dmf.name || 'DefleMask Module',
    importedAt: new Date().toISOString(),
    originalChannelCount: dmf.channelCount,
    originalPatternCount: patterns.length,
    originalInstrumentCount: dmf.instruments.length,
    modData: {
      moduleType: 'DMF',
      initialSpeed: dmf.ticksPerRow[0],
      initialBPM: bpm > 0 ? bpm : 125,
      amigaPeriods: false,
      channelNames: Array.from({ length: dmf.channelCount }, (_, i) => `Ch ${i + 1}`),
      songLength: dmf.matrixRows,
      restartPosition: 0,
      patternOrderTable: Array.from({ length: dmf.matrixRows }, (_, i) => i),
      songMessage: `${dmf.name} by ${dmf.author}`,
    },
  };

  return { instruments, patterns, metadata };
}

/**
 * Convert a single DefleMask note to XM-compatible format
 */
function convertDMFCell(dmfNote: {
  note: number;
  octave: number;
  volume: number;
  instrument: number;
  effects: Array<{ code: number; value: number }>;
}): DMFConvertedCell {
  let note = 0;

  if (dmfNote.note === 100) {
    // Note off
    note = 97;
  } else if (dmfNote.note >= 0 && dmfNote.note <= 11) {
    // Convert note (0-11) + octave to XM format (1-96)
    const octave = Math.max(0, Math.min(7, dmfNote.octave));
    note = (octave * 12) + dmfNote.note + 1;
    if (note > 96) note = 96;
    if (note < 1) note = 0;
  }

  // Convert volume (DefleMask uses 0-15, XM uses 0x10-0x50 for 0-64)
  let volume = 0;
  if (dmfNote.volume >= 0) {
    volume = 0x10 + Math.floor(dmfNote.volume * 4); // Scale 0-15 to 0-64
  }

  // Convert first effect
  let effectType = 0;
  let effectParam = 0;
  if (dmfNote.effects.length > 0) {
    const fx = dmfNote.effects[0];
    effectType = mapDMFEffect(fx.code);
    effectParam = fx.value & 0xFF;
  }

  return {
    note,
    instrument: dmfNote.instrument >= 0 ? dmfNote.instrument + 1 : 0,
    volume,
    effectType,
    effectParam,
  };
}

/**
 * Map DefleMask effect codes to XM effect codes
 */
function mapDMFEffect(dmfEffect: number): number {
  // DefleMask effect mapping to XM
  // Many effects are similar but some need translation
  const effectMap: Record<number, number> = {
    0x00: 0x00, // Arpeggio
    0x01: 0x01, // Portamento up
    0x02: 0x02, // Portamento down
    0x03: 0x03, // Tone portamento
    0x04: 0x04, // Vibrato
    0x07: 0x07, // Tremolo
    0x08: 0x08, // Panning
    0x09: 0x09, // Sample offset
    0x0A: 0x0A, // Volume slide
    0x0B: 0x0B, // Position jump
    0x0C: 0x0C, // Set volume
    0x0D: 0x0D, // Pattern break
    0x0F: 0x0F, // Set speed/tempo
    0x10: 0x10, // Set global volume (XM Gxx)
    0xE1: 0xE1, // Fine portamento up
    0xE2: 0xE2, // Fine portamento down
    0xE9: 0xE9, // Retrigger
    0xEA: 0xEA, // Fine volume slide up
    0xEB: 0xEB, // Fine volume slide down
    0xEC: 0xEC, // Note cut
    0xED: 0xED, // Note delay
  };

  return effectMap[dmfEffect] ?? 0;
}
