/**
 * SunVox controller metadata: the extractor reads psynth_register_ctl from the open sources, the generated
 * table is what the extractor produces today, and resolveSunVoxCtlMeta merges it with what the shipped
 * engine reports at runtime (runtime wins on range/type; the table adds unit, default and value names only
 * for the same controller).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractAll, extractModule } from '../../../../tools/extract-sunvox-ctls';
import { SUNVOX_MODULE_CONTROLS } from '@/engine/sunvox/sunvoxModuleControls.generated';
import { resolveSunVoxCtlMeta } from '@/engine/sunvox/sunvoxControlMeta';
import { sunvoxGraphToConfig, getSunVoxControlMeta } from '@/engine/sunvox-modular/graphToConfig';

const ROOT = resolve(__dirname, '../../../..');
const GENERATOR_CPP = resolve(ROOT, 'third-party/sunvox_sources-master/sunvox_engine/psynth/psynths_generator.cpp');

describe('SunVox controller extractor', () => {
  it('reads the Generator controllers with the waveform names and resolved constants', () => {
    const { typeName, controls } = extractModule(readFileSync(GENERATOR_CPP, 'utf8'));
    expect(typeName).toBe('Generator');
    expect(controls.map((c) => c.name)).toEqual(['Volume', 'Type', 'Panning', 'Attack', 'Release', 'Polyphony', 'Mode', 'Sustain', 'P.Modulation']);
    expect(controls[1]).toEqual({ name: 'Type', unit: '', min: 0, max: 4, def: 0, type: 1, enumLabels: ['tri', 'saw', 'rect', 'noise', 'dirty'] });
    // MAX_CHANNELS (#define 16) and MODES - 1 / MODE_HQ (enum) are resolved.
    expect(controls[5]).toEqual({ name: 'Polyphony', unit: 'ch.', min: 1, max: 16, def: 8, type: 1 });
    expect(controls[6]).toMatchObject({ min: 0, max: 1, def: 0, enumLabels: ['HQ', 'HQmono'] });
  });

  it('the committed table is the extractor output (14 open modules, 112 controllers)', () => {
    const fresh = extractAll();
    expect(SUNVOX_MODULE_CONTROLS).toEqual(fresh);
    expect(Object.keys(fresh)).toHaveLength(14);
    expect(Object.values(fresh).reduce((n, c) => n + c.length, 0)).toBe(112);
  });
});

describe('resolveSunVoxCtlMeta', () => {
  it('adds value names, unit and default to a runtime controller the sources describe', () => {
    expect(resolveSunVoxCtlMeta('Generator', 1, { name: 'Type', min: 0, max: 4, type: 1, group: 0 })).toEqual({
      name: 'Type', min: 0, max: 4, type: 1, group: 0, unit: '', def: 0,
      enumLabels: ['tri', 'saw', 'rect', 'noise', 'dirty'], fromSource: true,
    });
  });

  it('matches by name, not index, and drops value names when the runtime range differs', () => {
    const m = resolveSunVoxCtlMeta('Generator', 4, { name: 'Type', min: 0, max: 6, type: 1, group: 1 });
    expect(m).toMatchObject({ max: 6, group: 1, fromSource: true, enumLabels: undefined });
  });

  it('a closed module uses the runtime name, range and type, with numbers for its selectors', () => {
    expect(resolveSunVoxCtlMeta('Compressor', 2, { name: 'Mode', min: 0, max: 2, type: 1, group: 2 })).toEqual({
      name: 'Mode', min: 0, max: 2, type: 1, group: 2, unit: '', def: undefined, enumLabels: undefined, fromSource: false,
    });
  });

  it('without a runtime controller it falls back to the table by index, or nothing', () => {
    expect(resolveSunVoxCtlMeta('Kicker', 0)?.name).toBe(SUNVOX_MODULE_CONTROLS.Kicker[0].name);
    expect(resolveSunVoxCtlMeta('Compressor', 0)).toBeUndefined();
  });

  it('the modular editor graph builder attaches the merged metadata', () => {
    sunvoxGraphToConfig([{
      id: 3, name: 'Gen', typeName: 'Generator', flags: 1, inputs: [], outputs: [],
      controls: [{ name: 'Type', min: 0, max: 4, value: 2, type: 1, group: 0 }],
    }]);
    expect(getSunVoxControlMeta('sv_m3')).toMatchObject([{ id: 0, name: 'Type', enumLabels: ['tri', 'saw', 'rect', 'noise', 'dirty'] }]);
  });
});
