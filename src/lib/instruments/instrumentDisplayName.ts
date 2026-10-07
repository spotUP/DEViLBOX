/**
 * What the UI calls an instrument.
 *
 * An instrument the original file does not name has the name '' (parsers never
 * invent one). The UI shows the slot number for it, so a list row, a selector
 * entry or an editor header is never blank. The number is formatted the way
 * the tracker shows instrument numbers: two digits, hex or decimal.
 */
export interface NamedInstrument {
  id: number;
  name?: string | null;
}

/** The slot number as the tracker prints it ("0A" in hex mode, "10" otherwise). */
export function formatInstrumentNumber(id: number, hex = true): string {
  return hex ? id.toString(16).toUpperCase().padStart(2, '0') : id.toString(10).padStart(2, '0');
}

/** The instrument's stored name, or its slot number when it has none. */
export function instrumentDisplayName(inst: NamedInstrument, hex = true): string {
  const name = (inst.name ?? '').trim();
  return name || formatInstrumentNumber(inst.id, hex);
}
