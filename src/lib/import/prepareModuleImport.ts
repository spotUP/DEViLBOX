/**
 * prepareModuleImport - read a module file into the ModuleInfo that
 * importTrackerModule imports.
 *
 * The one place that decides HOW a module is read before import: UADE-only
 * formats are pre-scanned by the UADE engine, native-parser formats (and
 * Furnace) get header metadata (or libopenmpt's when it can also play them),
 * everything else goes through libopenmpt. This lived inline in
 * ImportModuleDialog, and every other way in (the file browser, MCP load_file,
 * the tour) read the file its own way - so the same MOD parsed differently
 * depending on how it arrived (2026-09-29 audit). The dialog and
 * importModuleFile both call this now.
 */
import { loadModuleFile, type ModuleInfo } from './ModuleLoader';
import { isUADEFormat } from './formats/UADEParser';
import { getNativeFormatMetadata, getNativeFormatExtendedMetadata } from './NativeFormatMetadata';
import { detectFormat, detectFormatFromContent, type FormatDefinition } from './FormatRegistry';
import type { UADEMetadata } from '@engine/uade/UADEEngine';
import { parseSIDHeader, type SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';
import { companionRelativeName } from './companionRelativeName';

/** A format with a native parser (non-libopenmpt, non-UADE-only), or Furnace / chip-dump. */
export function detectNativeFormat(filename: string): FormatDefinition | null {
  const fmt = detectFormat(filename);
  if (!fmt) return null;
  if (fmt.nativeParser || fmt.family === 'furnace' || fmt.family === 'chip-dump' || fmt.family === 'c64-chip') return fmt;
  return null;
}

/** Furnace / DefleMask — always the native parser, no libopenmpt or UADE option. */
export const isFurnaceFormat = (filename: string): boolean => detectFormat(filename)?.family === 'furnace';

/** Chip-dump formats with dedicated native parsers — no UADE mode selector needed. */
export const isChipDumpFormat = (filename: string): boolean => {
  const fmt = detectFormat(filename);
  return fmt?.family === 'chip-dump' || fmt?.family === 'c64-chip';
};

/** Whether only the UADE engine can read this file. */
export function isUADEExclusiveFile(filename: string, head?: Uint8Array): boolean {
  const fname = filename.toLowerCase();
  // The bytes outrank the name: a `.snd` that is Atari SNDH is not the Amiga
  // format of the same extension.
  if (head) {
    const byContent = detectFormatFromContent(fname, head);
    if (byContent && byContent !== detectFormat(fname)) return byContent.family === 'uade-only';
  }
  // isUADEFormat only checks extensions - prefix-named formats like
  // cust.songname are missed; the FormatRegistry understands prefixes
  // (family 'uade-only', or uadeFallback without a native parser).
  const fmt = detectFormat(fname);
  const byRegistry = !!fmt && !fmt.nativeParser &&
    (fmt.family === 'uade-only' || (fmt.uadeFallback && !fmt.nativeOnly));
  return !detectNativeFormat(fname) && !isFurnaceFormat(fname) && !isChipDumpFormat(fname) && (isUADEFormat(fname) || !!byRegistry);
}

export interface PreparedModule {
  info: ModuleInfo;
  /** UADE's pre-scan, for UADE-only formats (passed on to the import). */
  uadeMetadata?: UADEMetadata;
  /** The SID header, when the file is a SID. */
  sidInfo?: SIDHeaderInfo | null;
}

export interface PrepareHooks {
  /** UADE engine start-up progress (0-100) and phase. */
  onUadeProgress?: (progress: number, phase: string) => void;
  /** Called just before the UADE scan starts (the dialog can cancel it). */
  onUadeScanStart?: () => void;
}

export async function prepareModuleImport(file: File, companions: File[] = [], hooks: PrepareHooks = {}): Promise<PreparedModule> {
  const fname = file.name.toLowerCase();
  const nativeFmt = detectNativeFormat(fname);
  const isFurnace = isFurnaceFormat(fname);

  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (isUADEExclusiveFile(fname, head)) {
    const buf = await file.arrayBuffer();
    // Skip the pre-scan for synthetic/compiled 68k formats - the enhanced
    // scan corrupts UADE engine state, and later loads fail.
    const { UADEEngine } = await import('@engine/uade/UADEEngine');
    const engine = UADEEngine.getInstance();
    const unsub = engine.onInitProgress((progress, phase) => hooks.onUadeProgress?.(progress, phase));
    await engine.ready();
    // Reinit if the engine played a song before (~50 ms with the pre-compiled module).
    await engine.reinitIfNeeded();
    unsub();
    hooks.onUadeProgress?.(100, '');

    if (/\.(sun|tsm)$/i.test(fname)) {
      return {
        info: {
          metadata: { title: fname.replace(/\.[^/.]+$/, ''), type: 'SunTronic/TSM', channels: 4, patterns: 1, orders: 1, instruments: 0, samples: 0, duration: 0 },
          arrayBuffer: buf,
          file,
        },
      };
    }
    hooks.onUadeScanStart?.();
    // Companions go into UADE's virtual FS before the module loads.
    for (const companion of companions) {
      await engine.addCompanionFile(companionRelativeName(file, companion), await companion.arrayBuffer());
    }
    // CIA tick snapshots, so pattern reconstruction works when parseUADEFile
    // is later called with this pre-scan.
    engine.enableTickSnapshots(true);
    engine.resetTickSnapshots();
    const uadeMetadata = await engine.load(buf, file.name);
    return {
      uadeMetadata,
      info: {
        metadata: {
          title: file.name.replace(/\.[^/.]+$/, ''),
          type: uadeMetadata.formatName || 'UADE',
          channels: 4,
          patterns: 1,
          orders: uadeMetadata.subsongCount,
          instruments: 0,
          samples: 0,
          duration: 0,
        },
        arrayBuffer: buf,
        file,
      },
    };
  }

  // Native-parser formats + Furnace: libopenmpt only when it can also play
  // the format; otherwise header metadata, and parseModuleToSong parses at
  // import.
  if (nativeFmt || isFurnace) {
    const buf = await file.arrayBuffer();
    const sidInfo = parseSIDHeader(new Uint8Array(buf));
    const canUseLibopenmpt = nativeFmt?.nativeParser && (nativeFmt.libopenmptFallback || nativeFmt.libopenmptPlayable);
    if (canUseLibopenmpt) {
      try {
        return { info: await loadModuleFile(file), sidInfo };
      } catch (err) {
        // libopenmpt could not read it. The format still has its native
        // parser and, for `.mus`, UADE behind it; parseModuleToSong decides
        // at import. Rejecting here showed "Failed to load module: ptr" for
        // boogie.mus and loaded nothing (ledger F14).
        console.warn(`[prepareModuleImport] libopenmpt could not read ${file.name}; importing through the native route:`, err);
      }
    }

    const meta = nativeFmt
      ? getNativeFormatMetadata(nativeFmt.key, buf)
      : { channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1 };
    const extMeta = nativeFmt ? getNativeFormatExtendedMetadata(nativeFmt.key, buf) : null;
    let title = sidInfo?.title || extMeta?.title || file.name.replace(/\.[^/.]+$/, '');
    if (extMeta?.composer) title += ` — ${extMeta.composer}`;
    return {
      sidInfo,
      info: {
        metadata: {
          title,
          type: isFurnace ? 'Furnace' : nativeFmt!.label,
          channels: meta.channels,
          patterns: meta.patterns,
          orders: meta.orders,
          instruments: meta.instruments,
          samples: meta.samples,
          duration: 0,
          message: extMeta?.year ? `Year: ${extMeta.year}` : undefined,
        },
        arrayBuffer: buf,
        file,
      },
    };
  }

  // Standard path: libopenmpt (MOD, XM, IT, S3M, ...).
  return { info: await loadModuleFile(file) };
}
