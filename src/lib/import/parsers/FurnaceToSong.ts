/**
 * FurnaceToSong — Furnace → TrackerSong conversion
 *
 * Uses the FurnaceFileOps WASM module for byte-identical .fur parsing,
 * then converts native Furnace data to the editor's TrackerSong format.
 *
 * Falls back to the TS parser if the WASM module fails to load.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, FurnaceSubsongPlayback } from '@/types';
import type { TrackerCell } from '@/types/tracker';
import pako from 'pako';
import { furnaceRowToTrackerCell } from '../furnaceEditorCells';
import { notify } from '@/stores/useNotificationStore';
import { synthTypeForPlatform } from '@/engine/furnace-dispatch/synthPlatforms';
import type {
  FurnaceSubsong,
} from '@/types/tracker';

/**
 * Convert a FurnaceSubsong's native data to Pattern[] for the editor.
 */
function subsongToPatterns(
  sub: FurnaceSubsong,
  /** Per channel hardware type from the chip definition; see channelMeta.furnaceType. */
  channelTypes: readonly number[] = [],
): { patterns: Pattern[]; songPositions: number[] } {
  const ordersLen = sub.ordersLen;

  // Build unique pattern list from orders
  // In Furnace, each channel has its own order table. The editor uses a single
  // order table where each position maps to a Pattern containing all channels.
  // We need to create composite patterns from per-channel data.
  const songPositions: number[] = [];
  const patterns: Pattern[] = [];
  const patternCache = new Map<string, number>(); // key → pattern index

  for (let pos = 0; pos < ordersLen; pos++) {
    // Build a key from per-channel pattern indices for dedup
    const key = sub.orders.map(chOrders => chOrders[pos]).join(',');
    if (patternCache.has(key)) {
      songPositions.push(patternCache.get(key)!);
      continue;
    }

    const patIdx = patterns.length;
    patternCache.set(key, patIdx);
    songPositions.push(patIdx);

    const channels = sub.channels.map((chData, ch) => {
      const orderPatIdx = sub.orders[ch][pos];
      const patData = chData.patterns.get(orderPatIdx);
      const rows: TrackerCell[] = [];

      for (let row = 0; row < sub.patLen; row++) {
        if (patData && patData.rows[row]) {
          rows.push(furnaceRowToTrackerCell(patData.rows[row]));
        } else {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
      }

      return {
        id: `channel-${ch}`,
        name: chData.name || `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows,
        ...(channelTypes[ch] >= 0
          ? { channelMeta: { importedFromMOD: false, furnaceType: channelTypes[ch] } }
          : {}),
      };
    });

    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: sub.patLen,
      channels,
    });
  }

  return { patterns, songPositions };
}

/**
 * Compute initialBPM from Furnace timing parameters.
 * Furnace uses: hz * 2.5 * virtualTempoN / virtualTempoD
 */
function computeBPM(sub: FurnaceSubsong): number {
  const hz = sub.hz || 60;
  const vN = sub.virtualTempoN || 150;
  const vD = sub.virtualTempoD || 150;
  return Math.round(hz * 2.5 * vN / vD);
}

export async function parseFurnaceFile(buffer: ArrayBuffer, _fileName: string, subsong = 0): Promise<TrackerSong> {
  console.log(`[FurnaceToSong] parseFurnaceFile: "${_fileName}", ${buffer.byteLength} bytes, subsong=${subsong}`);

  // Detect DefleMask: by extension OR by decompressing zlib and checking magic
  const isDefleMask = /\.dmf$/i.test(_fileName) || isDMFFile(buffer);

  // Try WASM parser first, fall back to TS parser
  try {
    const result = await parseFurnaceFileWasm(buffer, _fileName, subsong);
    console.log(`[FurnaceToSong] WASM success: ${result.patterns.length} patterns, ${result.instruments.length} instruments`);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // DefleMask (.dmf) files can only be parsed by the WASM engine (which has
    // Furnace's full DMF import). The TS fallback only handles .fur format.
    if (isDefleMask) {
      throw new Error(`DefleMask import requires Furnace WASM engine (WASM error: ${errMsg})`);
    }
    console.warn('[FurnaceToSong] WASM parser failed, falling back to TS parser:', errMsg);
    try {
      const result = await parseFurnaceFileTS(buffer, _fileName, subsong);
      console.log(`[FurnaceToSong] TS fallback success: ${result.patterns.length} patterns, ${result.instruments.length} instruments`);
      return result;
    } catch (tsErr) {
      console.error('[FurnaceToSong] Both WASM and TS parsers failed!', { wasmErr: err, tsErr });
      throw tsErr;
    }
  }
}

/** Check if a buffer is a DefleMask file (zlib-compressed with .DefleMask magic inside) */
function isDMFFile(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  // Uncompressed DMF: starts with ".DefleMask" (0x2E 0x44 0x65)
  if (bytes[0] === 0x2E && bytes[1] === 0x44 && bytes[2] === 0x65) return true;
  // Zlib-compressed DMF: decompress and check magic
  if (bytes.length > 2 && bytes[0] === 0x78 &&
      (bytes[1] === 0x9c || bytes[1] === 0x01 || bytes[1] === 0xDA)) {
    try {
      let decompressed: Uint8Array;
      try {
        decompressed = pako.inflate(bytes);
      } catch {
        decompressed = pako.inflateRaw(bytes.subarray(2));
      }
      return decompressed[0] === 0x2E && decompressed[1] === 0x44 && decompressed[2] === 0x65;
    } catch { return false; }
  }
  return false;
}

/**
 * Parse using the FurnaceFileOps WASM module (byte-identical to Furnace CLI).
 */
async function parseFurnaceFileWasm(buffer: ArrayBuffer, _fileName: string, subsong = 0): Promise<TrackerSong> {
  const { loadFurFileWasm } = await import('@/lib/import/wasm/FurnaceFileOps');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');
  const { parseInstrument } = await import('@lib/import/formats/furnace/FurnaceInstrumentParser');
  const { mapFurnaceInstrumentType } = await import('@lib/import/formats/FurnaceSongParser');
  const { BinaryReader } = await import('@/utils/BinaryReader');

  // Hand the file to the WASM as it is. DivEngine::load() inflates it itself,
  // keeping the data a DefleMask file's bad adler32 would otherwise cost
  // (fileOpsCommon_patched.cpp). A second inflate here in pako was stricter
  // than that one — it refused files the engine loads — and fed the engine
  // bytes it then mistook for a failed zlib stream.
  const loaded = await loadFurFileWasm(buffer);
  // The file loaded, but not all of it: say so, rather than letting a song with
  // missing drums pass for a complete one.
  if (loaded.loadWarning) {
    notify.warning(`"${_fileName}" loaded with damage: ${loaded.loadWarning}`, 10000);
  }

  // Convert instruments from INS2 binary data extracted by WASM
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < loaded.instrumentBinaries.length; i++) {
    const binary = loaded.instrumentBinaries[i];
    if (binary.length < 8) {
      instruments.push({ id: i + 1, name: `Instrument ${i}`, type: 'synth', synthType: 'ChipSynth', config: {} } as unknown as InstrumentConfig);
      continue;
    }

    try {
      // Parse the INS2 binary using existing TS instrument parser
      const reader = new BinaryReader(binary.buffer as ArrayBuffer);
      const furIns = parseInstrument(reader);
      // A type the map has no chip for (STD above all), or a sample type —
      // whose samples are the module's, uploaded to the song's chips, not
      // the instrument's — belongs to whichever chip of this song plays it.
      // A DefleMask Genesis song's STD instruments are its SN76489's and
      // preview there as FurnacePSG, not as a generic Tone.js ChipSynth; its
      // "Legacy Samples" instrument plays on the YM2612's DAC, not as a
      // Sampler with no sample.
      const mapped = mapFurnaceInstrumentType(furIns.type);
      const synthType = (mapped === 'ChipSynth' || mapped === 'Sampler'
        ? synthTypeForPlatform(loaded.instrumentSystems[i])
        : undefined) ?? mapped;
      const previewChannel = loaded.instrumentChipChannels[i];

      // Build ParsedInstrument for the converter
      const parsed: import('@/types/tracker').ParsedInstrument = {
        id: i + 1,
        name: furIns.name || `Instrument ${i}`,
        samples: [],
        fadeout: 0,
        volumeType: 'none',
        panningType: 'none',
        rawBinaryData: binary,
        furnace: {
          chipType: furIns.type,
          synthType,
          fm: furIns.fm,
          macros: (furIns.macros || []).map(m => ({
            code: m.code, type: m.type, data: m.data,
            loop: m.loop ?? -1, release: m.release ?? -1,
            mode: m.mode ?? 0, delay: m.delay ?? 0, speed: m.speed ?? 1,
          })),
          wavetables: (furIns.wavetables || []).map((wtIndex, wi) => ({
            id: wi, data: [] as number[], len: 0, max: 0, index: wtIndex,
          })),
          amiga: furIns.amiga,
          opMacroArrays: furIns.opMacroArrays?.map(ops =>
            ops.map(m => ({
              code: m.code, type: m.type, data: m.data,
              loop: m.loop ?? -1, release: m.release ?? -1,
              mode: m.mode ?? 0, delay: m.delay ?? 0, speed: m.speed ?? 1,
            }))
          ),
          chipConfig: {
            ...(furIns.gb ? { gb: furIns.gb } : {}),
            ...(furIns.c64 ? { c64: furIns.c64 } : {}),
            ...(furIns.snes ? { snes: furIns.snes } : {}),
            ...(furIns.n163 ? { n163: furIns.n163 } : {}),
            ...(furIns.fds ? { fds: furIns.fds } : {}),
            ...(furIns.es5506 ? { es5506: furIns.es5506 } : {}),
            ...(furIns.multipcm ? { multipcm: furIns.multipcm } : {}),
            ...(furIns.soundUnit ? { soundUnit: furIns.soundUnit } : {}),
            ...(furIns.esfm ? { esfm: furIns.esfm } : {}),
            ...(furIns.powerNoise ? { powerNoise: furIns.powerNoise } : {}),
            ...(furIns.sid2 ? { sid2: furIns.sid2 } : {}),
          },
        },
      };

      const converted = convertToInstrument(parsed, i + 1, 'FUR');
      for (const inst of converted) {
        if (inst.furnace && previewChannel > 0) inst.furnace.previewChannel = previewChannel;
      }
      instruments.push(...converted.map((inst, j) => ({ ...inst, id: i + 1 + j })));
    } catch (err) {
      console.warn(`[FurnaceToSong] Failed to parse instrument ${i}:`, err);
      instruments.push({ id: i + 1, name: `Instrument ${i}`, type: 'synth', synthType: 'ChipSynth', config: {} } as unknown as InstrumentConfig);
    }
  }

  // Convert active subsong patterns
  const activeSub = loaded.nativeData.subsongs[subsong] || loaded.nativeData.subsongs[0];
  const { patterns, songPositions } = subsongToPatterns(activeSub, loaded.channelTypes);
  const numChannels = activeSub.channels.length;

  // Store module-level wavetables/samples on the dispatch engine singleton.
  // ALWAYS update — even when empty — to clear stale data from the previous song.
  {
    const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(loaded.wavetables.length > 0 ? loaded.wavetables : null);
    engine.setModuleSamples(loaded.samples.length > 0 ? loaded.samples : null);
  }

  // Upload to WASM sequencer for native playback — only if engine is already initialized.
  // If not yet initialized (no worklet), TrackerReplayer will upload when play is clicked.
  try {
    const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
    if (FurnaceDispatchEngine.getInstance().isInitialized) {
      const { uploadFurnaceToSequencer } = await import('@/lib/export/FurnaceSequencerSerializer');
      FurnaceDispatchEngine.getInstance().sendMixVolumes(loaded.nativeData);
      await uploadFurnaceToSequencer(loaded.nativeData, subsong);
      console.log('[FurnaceToSong] WASM-parsed song uploaded to WASM sequencer');
    }
  } catch (err) {
    console.warn('[FurnaceToSong] Failed to upload to WASM sequencer:', err);
  }

  // Pre-convert all subsongs for in-editor switching
  const furnaceSubsongs: FurnaceSubsongPlayback[] | undefined =
    loaded.numSubsongs > 1
      ? loaded.nativeData.subsongs.map((sub, i) => {
          const converted = subsongToPatterns(sub, loaded.channelTypes);
          return {
            name: sub.name || `Subsong ${i + 1}`,
            patterns: converted.patterns,
            songPositions: converted.songPositions,
            initialSpeed: sub.speed1,
            initialBPM: computeBPM(sub),
            speed2: sub.speed2,
            hz: sub.hz,
            virtualTempoN: sub.virtualTempoN,
            virtualTempoD: sub.virtualTempoD,
            grooves: loaded.nativeData.grooves?.map(g => g.val),
          };
        })
      : undefined;

  console.log(`[FurnaceToSong] WASM parsed: "${loaded.name}", ${numChannels} channels, ${patterns.length} patterns, ${loaded.numSubsongs} subsongs`);

  return {
    name: loaded.name || _fileName.replace(/\.[^/.]+$/, ''),
    format: 'XM' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: activeSub.speed1,
    initialBPM: computeBPM(activeSub),
    speed2: activeSub.speed2,
    hz: activeSub.hz,
    virtualTempoN: activeSub.virtualTempoN,
    virtualTempoD: activeSub.virtualTempoD,
    grooves: loaded.nativeData.grooves?.map(g => g.val),
    furnaceWavetables: loaded.wavetables.length > 0 ? loaded.wavetables : undefined,
    furnaceSamples: loaded.samples.length > 0 ? loaded.samples : undefined,
    furnaceNative: loaded.nativeData,
    furnaceSubsongs,
    furnaceActiveSubsong: subsong,
  };
}

/**
 * Fallback: Parse using the TypeScript parser.
 */
async function parseFurnaceFileTS(buffer: ArrayBuffer, _fileName: string, subsong = 0): Promise<TrackerSong> {
  const { parseFurnaceSong, convertFurnaceToDevilbox, convertSubsongForPlayback } = await import('@lib/import/formats/FurnaceSongParser');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');

  const module = await parseFurnaceSong(buffer);
  const result = convertFurnaceToDevilbox(module, subsong);

  const instruments = result.instruments
    .map((inst, idx) => convertToInstrument(inst, idx + 1, 'FUR'))
    .flat()
    .map((inst, i) => ({ ...inst, id: i + 1 })) as InstrumentConfig[];

  const patternOrder = result.metadata.modData?.patternOrderTable || [];
  const patterns = result.patterns;
  const patLen = patterns[0]?.length || 64;
  const numChannels = patterns[0]?.[0]?.length || 4;

  interface FurnaceCell {
    note?: number; instrument?: number; volume?: number;
    effectType?: number;  effectParam?: number;
    effectType2?: number; effectParam2?: number;
    effectType3?: number; effectParam3?: number;
    effectType4?: number; effectParam4?: number;
    effectType5?: number; effectParam5?: number;
    effectType6?: number; effectParam6?: number;
    effectType7?: number; effectParam7?: number;
    effectType8?: number; effectParam8?: number;
  }
  const convertedPatterns: Pattern[] = patterns.map((pat: FurnaceCell[][], idx: number) => ({
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: patLen,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: pat.map((row: FurnaceCell[]) => {
        const cell = row[ch] || {};
        const trackerCell: TrackerCell = {
          note: cell.note || 0,
          instrument: cell.instrument || 0,
          volume: cell.volume || 0,
          effTyp: cell.effectType || 0,
          eff: cell.effectParam || 0,
          effTyp2: cell.effectType2 || 0,
          eff2: cell.effectParam2 || 0,
        };
        if (cell.effectType3 || cell.effectParam3) { trackerCell.effTyp3 = cell.effectType3 || 0; trackerCell.eff3 = cell.effectParam3 || 0; }
        if (cell.effectType4 || cell.effectParam4) { trackerCell.effTyp4 = cell.effectType4 || 0; trackerCell.eff4 = cell.effectParam4 || 0; }
        if (cell.effectType5 || cell.effectParam5) { trackerCell.effTyp5 = cell.effectType5 || 0; trackerCell.eff5 = cell.effectParam5 || 0; }
        if (cell.effectType6 || cell.effectParam6) { trackerCell.effTyp6 = cell.effectType6 || 0; trackerCell.eff6 = cell.effectParam6 || 0; }
        if (cell.effectType7 || cell.effectParam7) { trackerCell.effTyp7 = cell.effectType7 || 0; trackerCell.eff7 = cell.effectParam7 || 0; }
        if (cell.effectType8 || cell.effectParam8) { trackerCell.effTyp8 = cell.effectType8 || 0; trackerCell.eff8 = cell.effectParam8 || 0; }
        return trackerCell;
      }),
    })),
  }));

  {
    const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(result.wavetables.length > 0 ? result.wavetables : null);
    engine.setModuleSamples(result.samples.length > 0 ? result.samples : null);
  }

  if (result.furnaceNative) {
    try {
      const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
      if (FurnaceDispatchEngine.getInstance().isInitialized) {
        const { uploadFurnaceToSequencer } = await import('@/lib/export/FurnaceSequencerSerializer');
        FurnaceDispatchEngine.getInstance().sendMixVolumes(result.furnaceNative);
        await uploadFurnaceToSequencer(result.furnaceNative, subsong);
        console.log('[FurnaceToSong] Song uploaded to WASM sequencer (TS fallback)');
      }
    } catch (err) {
      console.warn('[FurnaceToSong] Failed to upload to WASM sequencer, falling back to TS replayer:', err);
    }
  }

  type SubCell = { note?: number; instrument?: number; volume?: number;
    effectType?: number; effectParam?: number; effectType2?: number; effectParam2?: number;
    effectType3?: number; effectParam3?: number; effectType4?: number; effectParam4?: number;
    effectType5?: number; effectParam5?: number; effectType6?: number; effectParam6?: number;
    effectType7?: number; effectParam7?: number; effectType8?: number; effectParam8?: number; };
  function cellsToPatterns(rawPats: SubCell[][][], rowLen: number, numCh: number, prefix: string): Pattern[] {
    return rawPats.map((pat, idx) => ({
      id: `${prefix}-${idx}`,
      name: `Pattern ${idx}`,
      length: rowLen,
      channels: Array.from({ length: numCh }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
        instrumentId: null, color: null,
        rows: pat.map((row: SubCell[]) => {
          const cell = row[ch] || {};
          const tc: TrackerCell = {
            note: cell.note || 0, instrument: cell.instrument || 0,
            volume: cell.volume || 0, effTyp: cell.effectType || 0,
            eff: cell.effectParam || 0, effTyp2: cell.effectType2 || 0,
            eff2: cell.effectParam2 || 0,
          };
          if (cell.effectType3 || cell.effectParam3) { tc.effTyp3 = cell.effectType3 || 0; tc.eff3 = cell.effectParam3 || 0; }
          if (cell.effectType4 || cell.effectParam4) { tc.effTyp4 = cell.effectType4 || 0; tc.eff4 = cell.effectParam4 || 0; }
          if (cell.effectType5 || cell.effectParam5) { tc.effTyp5 = cell.effectType5 || 0; tc.eff5 = cell.effectParam5 || 0; }
          if (cell.effectType6 || cell.effectParam6) { tc.effTyp6 = cell.effectType6 || 0; tc.eff6 = cell.effectParam6 || 0; }
          if (cell.effectType7 || cell.effectParam7) { tc.effTyp7 = cell.effectType7 || 0; tc.eff7 = cell.effectParam7 || 0; }
          if (cell.effectType8 || cell.effectParam8) { tc.effTyp8 = cell.effectType8 || 0; tc.eff8 = cell.effectParam8 || 0; }
          return tc;
        }),
      })),
    }));
  }

  const furnaceSubsongs: FurnaceSubsongPlayback[] = module.subsongs.map((_, i) => {
    const subResult = i === subsong ? result : convertSubsongForPlayback(module, i);
    const subMeta = subResult.metadata;
    const subPatterns = subResult.patterns as unknown as SubCell[][][];
    const subPatLen = module.subsongs[i]?.patLen || patLen;
    return {
      name: module.subsongs[i]?.name || `Subsong ${i + 1}`,
      patterns: cellsToPatterns(subPatterns, subPatLen, numChannels, `sub${i}`),
      songPositions: subMeta.modData?.patternOrderTable ?? Array.from({ length: subPatterns.length }, (_, j) => j),
      initialSpeed: subMeta.modData?.initialSpeed ?? 6,
      initialBPM: subMeta.modData?.initialBPM ?? 125,
      speed2: subMeta.furnaceData?.speed2 || undefined,
      hz: subMeta.furnaceData?.hz || undefined,
      virtualTempoN: subMeta.furnaceData?.virtualTempoN || undefined,
      virtualTempoD: subMeta.furnaceData?.virtualTempoD || undefined,
      grooves: subMeta.furnaceData?.grooves,
    };
  });

  const furnaceData = result.metadata.furnaceData;
  return {
    name: result.metadata.sourceFile.replace(/\.[^/.]+$/, ''),
    format: 'XM' as TrackerFormat,
    patterns: convertedPatterns,
    instruments,
    songPositions: patternOrder.length > 0 ? patternOrder : convertedPatterns.map((_, i) => i),
    songLength: patternOrder.length || convertedPatterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: result.metadata.modData?.initialSpeed ?? 6,
    initialBPM: result.metadata.modData?.initialBPM ?? 125,
    speed2: furnaceData?.speed2,
    hz: furnaceData?.hz,
    virtualTempoN: furnaceData?.virtualTempoN,
    virtualTempoD: furnaceData?.virtualTempoD,
    compatFlags: furnaceData?.compatFlags as Record<string, unknown> | undefined,
    grooves: furnaceData?.grooves,
    furnaceWavetables: result.wavetables.length > 0 ? result.wavetables : undefined,
    furnaceSamples: result.samples.length > 0 ? result.samples : undefined,
    furnaceNative: result.furnaceNative,
    furnaceSubsongs: module.subsongs.length > 1 ? furnaceSubsongs : undefined,
    furnaceActiveSubsong: subsong,
  };
}
