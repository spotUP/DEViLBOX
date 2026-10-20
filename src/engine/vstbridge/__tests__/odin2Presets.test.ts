// @vitest-environment node
/**
 * Odin2 on the real engine (OdinAudioProcessor in WASM): the bundled preset index matches the shipped
 * .odin files, a new instrument starts on the default preset, presets load as native state through the
 * 'loadPreset' command (the one path the picker, the file import and VSTBridgeSynth use), ValueTree
 * selectors move the sound, and each preset's loudness trim lands the peak near -10 dBFS.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ODIN2_PRESETS } from '@constants/odin2PresetIndex';
import {
  DEFAULT_ODIN2_PRESET_ID, ODIN2_PRESET_PARAM_KEY, findOdin2Preset, loadOdin2PresetBytes, setOdin2Selector,
} from '../odin2Preset';
import { odinPresetValues } from '../odinState';
import { SYNTH_REGISTRY } from '../synth-registry';
import { applySynthTypeDefaults } from '@stores/instrument/synthTypeDefaults';
import { createOdin2, renderOdin2, ODIN2_WASM_PRESENT } from '../../../../tools/lib/odin2Wasm';
import type { InstrumentConfig } from '@typedefs/instrument';

const PUBLIC = resolve(__dirname, '../../../../public');
const BANK_DIR = resolve(PUBLIC, 'data/presets/odin2');
// The bank is a separate repo (npm run presets:sync); without it the file-backed tests cannot run.
const HAVE_BANK = existsSync(BANK_DIR);
const HAVE_ALL = HAVE_BANK && ODIN2_WASM_PRESENT;

const bytesOf = (id: string): Uint8Array => {
  const entry = findOdin2Preset(id);
  if (!entry) throw new Error(`no preset ${id}`);
  return new Uint8Array(readFileSync(resolve(PUBLIC, entry.path.replace(/^\//, ''))));
};

describe('Odin2 preset index', () => {
  it('carries the three packs with their authors', () => {
    const count = (pack: string) => ODIN2_PRESETS.filter((p) => p.pack === pack).length;
    expect(count('factory')).toBe(260);
    expect(count('lundh')).toBe(41);
    expect(count('psylion')).toBeGreaterThanOrEqual(18);
    expect(ODIN2_PRESETS.filter((p) => p.pack === 'lundh').every((p) => p.author.includes('Lukas Lundh'))).toBe(true);
    expect(ODIN2_PRESETS.filter((p) => p.pack === 'psylion').every((p) => p.author.length > 0)).toBe(true);
    expect(new Set(ODIN2_PRESETS.map((p) => p.id)).size).toBe(ODIN2_PRESETS.length);
    expect(findOdin2Preset(DEFAULT_ODIN2_PRESET_ID)?.name).toBe('Odin2 Bass - Growly FM Bass');
  });

  it.skipIf(!HAVE_BANK)('lists exactly the .odin files on disk', () => {
    const onDisk = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true }).reduce(
        (n, e) => n + (e.isDirectory() ? onDisk(resolve(dir, e.name)) : e.name.endsWith('.odin') ? 1 : 0), 0);
    expect(ODIN2_PRESETS.length).toBe(onDisk(BANK_DIR));
    for (const p of ODIN2_PRESETS) expect(existsSync(resolve(PUBLIC, p.path.replace(/^\//, ''))), p.path).toBe(true);
  });
});

describe('Odin2 registry and defaults', () => {
  it('registers the native-state commands and no flat-parameter config key', () => {
    const d = SYNTH_REGISTRY.get('Odin2');
    expect(d?.commands).toEqual(['loadPreset', 'setValueTreeProperty']);
    expect(d?.configKey).toBeUndefined();
  });

  it('a new Odin2 instrument starts on the default bundled preset', () => {
    const inst = { id: 1, name: 'x', type: 'synth', synthType: 'Odin2', effects: [], volume: -12, pan: 0 } as unknown as InstrumentConfig;
    applySynthTypeDefaults(inst, 'Odin2', false);
    expect((inst.parameters as Record<string, unknown>)[ODIN2_PRESET_PARAM_KEY]).toBe(DEFAULT_ODIN2_PRESET_ID);
  });
});

describe.skipIf(!HAVE_ALL)('Odin2 engine', () => {
  it('loads a mod-matrix/arpeggiator preset as native state and sounds unlike Init', async () => {
    const arpEntry = ODIN2_PRESETS.find((p) => p.pack === 'factory' && (odinPresetValues(bytesOf(p.id)).params.arp_on ?? 0) > 0.5);
    expect(arpEntry, 'a factory preset with the arpeggiator on').toBeDefined();
    const init = await renderOdin2({});
    const arp = await renderOdin2({ preset: bytesOf(arpEntry!.id) });
    expect(init.stateLoads).toBe(0);
    expect(arp.stateLoads).toBeGreaterThan(0); // loadPreset reached setStateInformation
    expect(Math.abs(arp.energy - init.energy) / Math.max(init.energy, 1e-9)).toBeGreaterThan(0.05);
  }, 60000);

  it('the shared load path (picker, import, default) reaches the engine', async () => {
    const synth = await createOdin2();
    try {
      const target = { sendCommand: async (type: string, data?: Uint8Array) => synth.handleCommand(type, data ?? new Uint8Array()) };
      expect(synth.getStateLoadCount()).toBe(0);
      expect(await loadOdin2PresetBytes(target, bytesOf(DEFAULT_ODIN2_PRESET_ID))).toBe(true);
      expect(synth.getStateLoadCount()).toBe(1);
      expect(await loadOdin2PresetBytes(target, new Uint8Array([1, 2, 3]))).toBe(false); // junk file is refused
    } finally {
      synth.delete();
    }
  }, 60000);

  it('ValueTree selectors change the sound', async () => {
    const target = (synth: Awaited<ReturnType<typeof createOdin2>>) => ({
      sendCommand: async (type: string, data?: Uint8Array) => synth.handleCommand(type, data ?? new Uint8Array()),
    });
    const base = await renderOdin2({});
    const osc = await renderOdin2({ valueTree: ['osc.osc1_type=3'] });
    const fil = await renderOdin2({ valueTree: ['misc.fil1_type=1'] });
    expect(osc.energy).not.toBeCloseTo(base.energy, 3);
    expect(fil.energy).not.toBeCloseTo(base.energy, 3);
    const synth = await createOdin2();
    try {
      expect(await setOdin2Selector(target(synth), 'osc', 'osc1_type', 3)).toBe(true);
      expect(await setOdin2Selector(target(synth), 'osc', 'no_such_property', 3)).toBe(false);
    } finally {
      synth.delete();
    }
  }, 60000);

  it('the default preset with its trim peaks near -10 dBFS', async () => {
    const entry = findOdin2Preset(DEFAULT_ODIN2_PRESET_ID)!;
    const offset = SYNTH_REGISTRY.get('Odin2')?.volumeOffsetDb ?? 0;
    const r = await renderOdin2({ preset: bytesOf(entry.id) });
    expect(Math.abs(r.peakDb - 12 + offset + entry.gainTrimDb + 10)).toBeLessThanOrEqual(2);
  }, 60000);
});
