/**
 * What the UI calls an instrument.
 *
 * Exactly the name the file stores, as ProTracker shows it: an unnamed slot is
 * blank, never a made-up label or a number standing in for a name (owner,
 * 2026-10-07: "show nothing if an empty sample are not named ... dont make
 * things up"). Spaces are kept - authors draw text art in name slots. The slot
 * number is its own column, formatted by formatInstrumentNumber.
 */
export interface NamedInstrument {
  id: number;
  name?: string | null;
}

/** The slot number as the tracker prints it ("0A" in hex mode, "10" otherwise). */
export function formatInstrumentNumber(id: number, hex = true): string {
  return hex ? id.toString(16).toUpperCase().padStart(2, '0') : id.toString(10).padStart(2, '0');
}

/** The instrument's stored name, verbatim; '' when the file names none. */
export function instrumentDisplayName(inst: NamedInstrument): string {
  return inst.name ?? '';
}
