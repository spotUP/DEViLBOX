/**
 * Furnace instrument files (.fui, .dmp) written from the editor's instrument state. The bytes are written by
 * Furnace's own C++ (fileops WASM): the store's FurnaceConfig becomes an INS2 block (encodeInstrumentAsINS2, the
 * encoder the .fur exporters use), DivInstrument::readInsData reads it, putInsData2 / saveDMP write the file. The .fui
 * also carries the instrument's wavetables its wave macro uses (Furnace's LW feature + WAVE blocks).
 */
import type { FurnaceConfig } from '@typedefs/instrument';
import { encodeInstrumentAsINS2, type FurnaceInstrument } from '@lib/import/formats/furnace/FurnaceInstrumentParser';
import { instrumentFromIns2Wasm, type FurnaceInstrumentFile } from '@lib/import/wasm/FurnaceFileOps';
import { FUR_EXPORT_VERSION } from './FurnaceModuleExporter';
import { resolveInsType } from './FurnaceInstrumentEncoder';

/** The file-level view of a store instrument: every chip block the config carries, FM operators when it has them. */
function toFileInstrument(name: string, cfg: FurnaceConfig): FurnaceInstrument {
  const { gb, c64, snes, n163, fds, es5506, multipcm, soundUnit, esfm, sid2 } = cfg;
  return {
    name,
    type: resolveInsType(cfg),
    fm: cfg.operators.length > 0 ? cfg : undefined,
    macros: cfg.macros.filter((m) => m.data.length > 0),
    samples: [],
    wavetables: [],
    opMacroArrays: cfg.opMacroArrays?.map((a) => a.filter((m) => m.data.length > 0)),
    ...{ gb, c64, snes, n163, fds, es5506, multipcm, soundUnit, esfm, sid2 },
  } as unknown as FurnaceInstrument;
}

export function furnaceInstrumentFile(name: string, cfg: FurnaceConfig): Promise<FurnaceInstrumentFile> {
  const waves = cfg.wavetables.map((w) => ({ data: w.data, max: w.max ?? Math.max(1, ...w.data) }));
  return instrumentFromIns2Wasm(encodeInstrumentAsINS2(toFileInstrument(name, cfg), FUR_EXPORT_VERSION), waves);
}
