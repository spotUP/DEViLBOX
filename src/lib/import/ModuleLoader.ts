/**
 * ModuleLoader - Loads and parses tracker module files (MOD, XM, IT, S3M)
 * Uses native parsers (XM/MOD) for full sample/envelope extraction
 * Falls back to libopenmpt for other formats (IT, S3M, etc.)
 */

import { ChiptunePlayer } from './ChiptunePlayer';
import { parseXM } from './formats/XMParser';
import { parseMOD } from './formats/MODParser';
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
  player: ChiptunePlayer;
  file: File;  // Original file for sample extraction
  // Native parser data (if available)
  nativeData?: {
    format: 'XM' | 'MOD';
    importMetadata: ImportMetadata;
    instruments: ParsedInstrument[];
    patterns: any[][];  // XMNote[][] or MODNote[][]
  };
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
      const useNativeParser = ext === '.xm' || ext === '.mod';

      try {
        // Try native parser for XM/MOD
        if (useNativeParser) {
          console.log('[ModuleLoader] Trying native parser for', ext);
          try {
            const nativeData = await loadWithNativeParser(arrayBuffer, ext, file.name);
            console.log('[ModuleLoader] Native parser result:', {
              hasData: !!nativeData,
              format: nativeData?.format,
              patternsCount: nativeData?.patterns?.length,
            });
            if (nativeData) {
              // Create metadata for compatibility
              const metadata: ModuleMetadata = {
                title: nativeData.importMetadata.sourceFile,
                type: nativeData.format,
                channels: nativeData.importMetadata.originalChannelCount,
                patterns: nativeData.importMetadata.originalPatternCount,
                orders: nativeData.importMetadata.modData?.songLength || 1,
                instruments: nativeData.importMetadata.originalInstrumentCount,
                samples: nativeData.importMetadata.originalInstrumentCount,
                duration: 0,
                message: nativeData.importMetadata.modData?.songMessage,
              };

              // Also load with libopenmpt for playback
              const player = await loadWithLibopenmpt(arrayBuffer, file);

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
            console.warn(`[ModuleLoader] Native parser failed, falling back to libopenmpt:`, nativeError);
          }
        }

        // Fall back to libopenmpt
        const player = await loadWithLibopenmpt(arrayBuffer, file);

        // Set up metadata handler
        const metadata = await new Promise<ModuleMetadata>((metaResolve, metaReject) => {
          const timeout = setTimeout(() => {
            metaReject(new Error('Timeout waiting for metadata'));
          }, 5000);

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

          player.onError((err: any) => {
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
  await info.player.play(info.arrayBuffer);
}

/**
 * Stop module preview
 */
export function stopPreview(info: ModuleInfo): void {
  info.player.stop();
}

/**
 * Load using native parser (XM or MOD)
 */
async function loadWithNativeParser(
  buffer: ArrayBuffer,
  ext: string,
  _filename: string
): Promise<ModuleInfo['nativeData'] | null> {
  try {
    if (ext === '.xm') {
      const result = await parseXM(buffer);
      return {
        format: 'XM',
        importMetadata: result.metadata,
        instruments: result.instruments,
        patterns: result.patterns as any,
      };
    } else if (ext === '.mod') {
      const result = await parseMOD(buffer);
      return {
        format: 'MOD',
        importMetadata: result.metadata,
        instruments: result.instruments,
        patterns: result.patterns as any,
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
  arrayBuffer: ArrayBuffer,
  _file: File
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

    player.onError((err: any) => {
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
    '.mod', '.xm', '.it', '.s3m', '.mptm',
    '.669', '.amf', '.ams', '.dbm', '.dmf',
    '.dsm', '.far', '.gdm', '.imf', '.j2b',
    '.mdl', '.med', '.mt2', '.mtm', '.okt',
    '.psm', '.ptm', '.stm', '.ult', '.umx',
  ];
}

/**
 * Check if a file is a supported module format
 */
export function isSupportedModule(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return getSupportedExtensions().includes(ext);
}
