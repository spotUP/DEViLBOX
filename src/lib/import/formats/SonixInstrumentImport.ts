/**
 * Standalone Sonix instrument import.
 *
 * Turns dropped `.instr` (synth) and `.ss` (SampledSound) files — with no accompanying
 * song — into DEViLBOX InstrumentConfigs that can be appended to the instrument bank.
 * Mirrors the companion-resolution logic in IffSmusParser (pair a `.instr` with its `.ss`
 * by basename) so a dropped `instruments/` folder behaves the same as a loaded song's bank.
 *
 * Synth voices decode via parseSonixSynthInstr (pure TS, offset-identical to the WASM
 * decode). Sample voices decode via parseSonixSampleFile (`.ss`). A `.instr` that is NOT a
 * synth (SampledSound / 8SVX header) is decoded from its paired `.ss` when present;
 * standalone 8SVX-in-`.instr` is not yet TS-decodable and is reported as skipped.
 */

import type { InstrumentConfig } from '@typedefs/instrument';
import { createSamplerInstrument } from './AmigaUtils';
import { isSonixSynthInstr, parseSonixSampleFile } from './IffSmusParser';
import { parseSonixSynthInstr, getDefaultSonixParams } from '@engine/sonix/sonixInstrument';

export interface SonixInstrumentFile {
  name: string;
  buffer: ArrayBuffer;
}

export interface SonixStandaloneResult {
  /** Built instrument configs (id 0 → the store assigns the next free slot on add). */
  configs: InstrumentConfig[];
  /** Names of files that could not be turned into an instrument. */
  skipped: string[];
}

interface GroupEntry {
  base: string;
  displayName: string;
  instr?: Uint8Array;
  ss?: Uint8Array;
}

/** True if a filename is a Sonix instrument companion this importer handles. */
export function isSonixInstrumentFile(name: string): boolean {
  return /\.(instr|ss)$/i.test(name);
}

/** Build instrument configs from dropped standalone `.instr` / `.ss` files. */
export function buildSonixInstrumentConfigs(files: SonixInstrumentFile[]): SonixStandaloneResult {
  // Group by lowercase basename so a .instr and its .ss pair into one instrument.
  const groups = new Map<string, GroupEntry>();
  for (const f of files) {
    if (!isSonixInstrumentFile(f.name)) continue;
    const lower = f.name.toLowerCase();
    const dot = lower.lastIndexOf('.');
    const base = dot > 0 ? lower.slice(0, dot) : lower;
    const ext = dot > 0 ? lower.slice(dot) : '';
    const displayBase = (() => {
      const d = f.name.lastIndexOf('.');
      const b = d > 0 ? f.name.slice(0, d) : f.name;
      return b.split(/[\\/]/).pop() || b;
    })();
    if (!groups.has(base)) groups.set(base, { base, displayName: displayBase });
    const g = groups.get(base)!;
    if (ext === '.instr') g.instr = new Uint8Array(f.buffer);
    else if (ext === '.ss') g.ss = new Uint8Array(f.buffer);
  }

  const configs: InstrumentConfig[] = [];
  const skipped: string[] = [];

  for (const g of groups.values()) {
    // Synth voice: decode params from the .instr directly.
    if (g.instr && isSonixSynthInstr(g.instr)) {
      const params = parseSonixSynthInstr(g.instr) ?? getDefaultSonixParams();
      params.index = 0;
      const cfg = createSamplerInstrument(0, g.displayName, new Uint8Array(2), 64, 8287, 0, 0);
      cfg.type = 'synth';
      cfg.synthType = 'SonixSynth';
      cfg.parameters = { sonixIndex: 0, sonix: params };
      configs.push(cfg);
      continue;
    }

    // Sample voice: decode PCM from the paired .ss.
    if (g.ss) {
      const parsed = parseSonixSampleFile(g.ss);
      if (parsed && parsed.pcm.length > 2) {
        configs.push(createSamplerInstrument(
          0, g.displayName, parsed.pcm, 64, parsed.sampleRate, parsed.loopStart, parsed.loopEnd,
        ));
        continue;
      }
    }

    // A non-synth .instr with no usable .ss (e.g. 8SVX embedded in the .instr) — not
    // TS-decodable here. Report rather than silently drop.
    skipped.push(g.instr ? `${g.displayName}.instr` : `${g.displayName}.ss`);
  }

  return { configs, skipped };
}
