/**
 * Pure helpers of the DX7 editor's VCED edits: what the panel shows (the firmware's voice with the instrument's edits
 * laid over it), which keys one knob move changed, and the voice name as VCED bytes 145..154. No engine, no React.
 */
import { DX7_NAME_FIRST_BYTE, DX7_NAME_LENGTH } from '@/constants/synthLayouts/dx7';

/** VCED values keyed by the byte offset as a string, the shape of `instrument.dx7.vced`. */
export type VcedRecord = Record<string, number>;

/** The sounding voice with the edits over it (an edit is newer than the poll that reported the voice). */
export function mergeVced(sounding: VcedRecord | null, edits: VcedRecord | undefined): VcedRecord {
  return { ...(sounding ?? {}), ...(edits ?? {}) };
}

/**
 * The keys whose number differs between what the panel showed and what the layout hands back. A select hands back its
 * option as a string and a toggle a boolean; both are read as the whole number the firmware takes (true is 1; a knob's fractional drag value is rounded).
 */
export function vcedDelta(before: VcedRecord, after: Record<string, unknown>): VcedRecord {
  const delta: VcedRecord = {};
  for (const [key, raw] of Object.entries(after)) {
    const value = typeof raw === 'boolean' ? (raw ? 1 : 0) : Math.round(Number(raw));
    if (Number.isFinite(value) && value !== before[key]) delta[key] = value;
  }
  return delta;
}

/** The name in the VCED (trailing spaces trimmed); empty while the voice is unknown. */
export function vcedName(vced: VcedRecord): string {
  let name = '';
  for (let i = 0; i < DX7_NAME_LENGTH; i++) {
    const ch = vced[String(DX7_NAME_FIRST_BYTE + i)];
    name += ch !== undefined && ch >= 32 && ch < 127 ? String.fromCharCode(ch) : ' ';
  }
  return name.trimEnd();
}

/** A name as the ten VCED bytes (space padded, printable ASCII only). */
export function nameToVced(name: string): VcedRecord {
  const delta: VcedRecord = {};
  for (let i = 0; i < DX7_NAME_LENGTH; i++) {
    const code = name.charCodeAt(i);
    delta[String(DX7_NAME_FIRST_BYTE + i)] = i < name.length && code >= 32 && code < 127 ? code : 32;
  }
  return delta;
}
