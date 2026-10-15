/**
 * Klystrack instrument <-> the synth layout (constants/synthLayouts/klystrack.ts). Pure: no store, no engine.
 *
 *  - klysLayoutValues reads an instrument as the layout's flat record: one number per field (selects as the
 *    string DOMSynthPanel's select wants) and one boolean per user-visible flag bit.
 *  - applyKlysLayoutChange diffs two records and sends each changed key to the ONE write path
 *    (klysInstrumentEdit: editKlysField / toggleKlysBit). Nothing else writes.
 */
import type { KlysNativeInstrument } from '@/types/tracker';
import {
  KLYS_FIELDS,
  KLYS_FIELD_KEYS,
  KLYS_FLAG_BITS,
  KLYS_FLAG_MEMBER,
  KLYS_MEMBERS,
  type KlysFieldKey,
  type KlysFlagWord,
} from '@/engine/klystrack/klysInstrumentFields';
import { KLYS_SELECT_FIELDS, klysFlagKey, parseKlysFlagKey } from '@/constants/synthLayouts/klystrack';
import { editKlysField, toggleKlysBit } from './klysInstrumentEdit';

export type KlysLayoutValue = number | string | boolean;
export type KlysLayoutValues = Record<string, KlysLayoutValue>;

const isFieldKey = (key: string): key is KlysFieldKey => Object.prototype.hasOwnProperty.call(KLYS_FIELDS, key);

/** The instrument as the layout's record. */
export function klysLayoutValues(inst: KlysNativeInstrument): KlysLayoutValues {
  const values: KlysLayoutValues = {};
  for (const key of KLYS_FIELD_KEYS) {
    const v = KLYS_FIELDS[key].get(inst);
    values[key] = KLYS_SELECT_FIELDS.has(key) ? String(v) : v;
  }
  for (const word of Object.keys(KLYS_FLAG_BITS) as KlysFlagWord[]) {
    const raw = KLYS_MEMBERS[KLYS_FLAG_MEMBER[word]].get(inst);
    for (const def of KLYS_FLAG_BITS[word]) values[klysFlagKey(word, def.bit)] = (raw & def.bit) !== 0;
  }
  return values;
}

/** Send every key that differs between `before` and `after` to the edit module; unknown keys are ignored. */
export function applyKlysLayoutChange(index: number, before: KlysLayoutValues, after: KlysLayoutValues): void {
  for (const key of Object.keys(after)) {
    if (after[key] === before[key]) continue;
    const flag = parseKlysFlagKey(key);
    if (flag) {
      if (Boolean(after[key]) !== Boolean(before[key])) toggleKlysBit(index, flag.word, flag.bit);
    } else if (isFieldKey(key)) {
      const value = Number(after[key]);
      if (Number.isFinite(value)) editKlysField(index, key, value);
    }
  }
}
