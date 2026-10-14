/**
 * Pure core of tools/nuade/probeCensus.ts. A nuade probe answers Supported (0), Unsure (2: structure plausible, no
 * magic number) or a rejection. The census keeps Supported and Unsure SEPARATE: counting only Supported hid every file
 * for players whose probe can only ever answer Unsure (gmc, soundcontrol, soundfactory).
 */
export const PROBE_SUPPORTED = 0;
export const PROBE_UNSURE = 2;

export type CensusEntry = {
  size: number;
  /** Players whose probe answered Supported. */
  ids: string[];
  /** Players whose probe answered Unsure. Absent on rows recorded before Unsure was counted. */
  unsure?: string[];
  /** Ids probed for `unsure` when only a subset was run; absent or 'all' = every player. */
  unsureScope?: string[] | 'all';
};

export type ProbeFn = (id: string) => number;

/** Probe `ids` and split the answers. */
export function classifyProbes(ids: readonly string[], probe: ProbeFn): { supported: string[]; unsure: string[] } {
  const supported: string[] = [];
  const unsure: string[] = [];
  for (const id of ids) {
    const r = probe(id);
    if (r === PROBE_SUPPORTED) supported.push(id);
    else if (r === PROBE_UNSURE) unsure.push(id);
  }
  return { supported, unsure };
}

/** True when the recorded entry already answers Unsure for every id in `wanted`. */
export function unsureCovered(e: CensusEntry | undefined, wanted: readonly string[]): boolean {
  if (!e?.unsure) return false;
  if (e.unsureScope === undefined || e.unsureScope === 'all') return true;
  const have = new Set(e.unsureScope);
  return wanted.every((id) => have.has(id));
}

/** Merge a (possibly partial) probe run into an entry: Supported stays complete, Unsure grows by scope. */
export function mergeUnsure(e: CensusEntry, probed: readonly string[], unsure: readonly string[], allIds: readonly string[]): CensusEntry {
  const full = probed.length >= allIds.length;
  if (full) return { ...e, unsure: [...unsure], unsureScope: 'all' };
  const prevScope = e.unsureScope === 'all' ? [...allIds] : e.unsureScope ?? [];
  const scope = [...new Set([...prevScope, ...probed])];
  const keep = (e.unsure ?? []).filter((id) => !probed.includes(id));
  return { ...e, unsure: [...keep, ...unsure], unsureScope: scope };
}
