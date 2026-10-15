/**
 * Klystrack instrument layout - generated from the ONE field table (KLYS_FIELDS) and the user-visible flag bits
 * (KLYS_FLAG_BITS), so no control is listed twice. Rendered by the shared DOMSynthPanel; the values it reads and
 * the edits it reports are translated by components/klystrack/klysLayoutAdapter.ts.
 *
 * Sections follow klystrack's own panels: instrument_view (pitch, oscillator, wavetable, volume, buzz, sync and
 * ring, filter), then instrument_view2 (effects, vibrato, pulse width modulation, program, frequency modulation).
 *
 * Layout keys: a field's own KLYS_FIELDS key (`cutoff`), or `<word>_<bit>` for a flag bit (`cydflags_512`).
 * Select controls carry the field value as a string (DOMSynthPanel's select value type).
 */
import type { ControlDescriptor, SectionDescriptor, SynthPanelLayout } from '@/types/synthPanel';
import {
  KLYS_BUZZ_SHAPES,
  KLYS_FIELDS,
  KLYS_FIELD_KEYS,
  KLYS_FILTER_TYPES,
  KLYS_FLAG_BITS,
  KLYS_SHAPES,
  type KlysFieldKey,
  type KlysFlagWord,
} from '@/engine/klystrack/klysInstrumentFields';
import { klysNoteName } from '@/engine/klystrack/klysProgramCommands';

type Option = { value: string; label: string };
export interface KlysWavetableName { name: string }

/** The layout key of a flag bit. */
export const klysFlagKey = (word: KlysFlagWord, bit: number): string => `${word}_${bit}`;

/** Parse a flag key back to its word and bit, or null when the key is a field key. */
export function parseKlysFlagKey(key: string): { word: KlysFlagWord; bit: number } | null {
  const m = /^(flags|cydflags|fmFlags)_(\d+)$/.exec(key);
  return m ? { word: m[1] as KlysFlagWord, bit: Number(m[2]) } : null;
}

/** The sections, in klystrack's panel order. Each field and bit names its section through its `group` / this map. */
const SECTION_ORDER = [
  'Pitch', 'Oscillator', 'Wavetable', 'Volume', 'Buzz', 'Sync and Ring', 'Filter',
  'Effects', 'Vibrato', 'Pulse Width Modulation', 'Program', 'Frequency Modulation',
] as const;

/** The section of each user-visible flag bit (a bit has no group of its own in KLYS_FLAG_BITS). */
const BIT_SECTION: Record<KlysFlagWord, Record<number, (typeof SECTION_ORDER)[number]>> = {
  flags: {
    2: 'Pitch', 4: 'Pitch', 8: 'Pitch', 16: 'Pitch', 32: 'Pitch',
    64: 'Buzz', 128: 'Volume', 256: 'Oscillator', 512: 'Wavetable', 1024: 'Program', 2048: 'Oscillator',
  },
  cydflags: {
    1: 'Oscillator', 2: 'Oscillator', 4: 'Oscillator', 8: 'Oscillator', 16: 'Sync and Ring', 64: 'Pitch', 128: 'Oscillator',
    256: 'Sync and Ring', 512: 'Filter', 1024: 'Effects', 4096: 'Wavetable', 8192: 'Wavetable', 16384: 'Oscillator',
    32768: 'Frequency Modulation',
  },
  fmFlags: { 4096: 'Frequency Modulation' },
};

/** Fields shown as a select instead of a knob. */
export const KLYS_SELECT_FIELDS: ReadonlySet<KlysFieldKey> = new Set<KlysFieldKey>([
  'pokeyNoiseType', 'wavetableEntry', 'buzzShape', 'syncSource', 'ringSource', 'filterType', 'effectsBus',
  'vibratoShape', 'pwmShape', 'fmWave',
]);

const numbered = (count: number, label: (n: number) => string): Option[] =>
  Array.from({ length: count }, (_, n) => ({ value: String(n), label: label(n) }));
const named = (names: readonly string[]): Option[] => names.map((label, n) => ({ value: String(n), label }));
const channels = (): Option[] => [
  { value: '255', label: 'Own Channel' },
  ...numbered(32, (n) => `Channel ${n + 1}`),
];

function selectOptions(key: KlysFieldKey, wavetables: readonly KlysWavetableName[]): Option[] {
  switch (key) {
    case 'pokeyNoiseType': return numbered(16, String);
    case 'wavetableEntry':
    case 'fmWave':
      return numbered(128, (n) => `${String(n).padStart(2, '0')} ${wavetables[n]?.name || '(empty)'}`);
    case 'buzzShape': return named(KLYS_BUZZ_SHAPES);
    case 'syncSource':
    case 'ringSource': return channels();
    case 'filterType': return named(KLYS_FILTER_TYPES);
    case 'effectsBus': return numbered(8, (n) => `Bus ${n + 1}`);
    case 'vibratoShape':
    case 'pwmShape': return named(KLYS_SHAPES);
    default: return [];
  }
}

function fieldControl(key: KlysFieldKey, wavetables: readonly KlysWavetableName[]): ControlDescriptor {
  const f = KLYS_FIELDS[key];
  if (KLYS_SELECT_FIELDS.has(key)) return { type: 'select', key, label: f.label, options: selectOptions(key, wavetables) };
  return {
    type: 'knob', key, label: f.label, min: f.min, max: f.max, defaultValue: f.min, bipolar: f.min < 0,
    ...(key === 'baseNote' ? { formatValue: (v: number) => klysNoteName(Math.round(v)) } : {}),
  };
}

/** The layout for a song whose wavetable entries are `wavetables` (names for the two entry selects). */
export function buildKlystrackLayout(wavetables: readonly KlysWavetableName[]): SynthPanelLayout {
  const sections: SectionDescriptor[] = SECTION_ORDER.map((label) => {
    const fieldKeys = KLYS_FIELD_KEYS.filter((k) => KLYS_FIELDS[k].group === label);
    const knobs = fieldKeys.filter((k) => !KLYS_SELECT_FIELDS.has(k)).map((k) => fieldControl(k, wavetables));
    const toggles: ControlDescriptor[] = [];
    for (const word of Object.keys(KLYS_FLAG_BITS) as KlysFlagWord[]) {
      for (const def of KLYS_FLAG_BITS[word]) {
        const section = BIT_SECTION[word][def.bit];
        if (section === undefined) throw new Error(`klystrack layout: ${word} bit ${def.bit} (${def.label}) has no section`);
        if (section === label) toggles.push({ type: 'toggle', key: klysFlagKey(word, def.bit), label: def.label });
      }
    }
    const selects = fieldKeys.filter((k) => KLYS_SELECT_FIELDS.has(k)).map((k) => fieldControl(k, wavetables));
    return { label, controls: [...knobs, ...toggles, ...selects] };
  });
  const placed = new Set(sections.flatMap((s) => s.controls.map((c) => c.key)));
  for (const k of KLYS_FIELD_KEYS) if (!placed.has(k)) throw new Error(`klystrack layout: field ${k} (group ${KLYS_FIELDS[k].group}) has no section`);
  return { name: 'Klystrack', configKey: 'klys', sections };
}

/** The layout before a song is loaded (no wavetable names): what SYNTH_LAYOUTS registers for KlysSynth. */
export const KLYSTRACK_LAYOUT: SynthPanelLayout = buildKlystrackLayout([]);
