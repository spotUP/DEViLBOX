/**
 * What the engine selector shows for one format row: the options with full-word labels and the measured scores, and the
 * value the store's choice shows as. Pure, so the instrument panel and the Settings tab share it (and a test can read it).
 */
import type { FormatEngineChoice } from '@/types/formatEngine';
import type { NuadeFormat } from './nuadeFormats';
import { displayChoiceFor, engineChoicesFor } from './nuadeRouting';

export const ENGINE_LABELS: Record<FormatEngineChoice, string> = { native: 'Our Engine', uade: 'UADE', nuade: 'nuade' };

export interface EngineOption { value: FormatEngineChoice; label: string }

const score = (v: number | null | undefined): string | null => (typeof v === 'number' ? v.toFixed(3) : null);

/** "nuade (0.996 like UADE)" once measured; the bare name before. */
export function engineOptionsFor(row: NuadeFormat): EngineOption[] {
  return engineChoicesFor(row).map((value) => {
    let note: string | null = null;
    if (value === 'nuade') note = score(row.uadeEnvelopeCorrelation) && `${score(row.uadeEnvelopeCorrelation)} like UADE`;
    if (value === 'native' && row.role === 'dual') note = score(row.ownEnvelopeCorrelation) && `${score(row.ownEnvelopeCorrelation)} like UADE`;
    return { value, label: note ? `${ENGINE_LABELS[value]} (${note})` : ENGINE_LABELS[value] };
  });
}

/** The option the effective stored choice shows as. */
export function selectedEngine(row: NuadeFormat, effective: FormatEngineChoice): FormatEngineChoice {
  return displayChoiceFor(row, effective);
}

/** The line under the select: why a held row stays on UADE, or what is measured. */
export function engineNote(row: NuadeFormat): string {
  if (row.heldBecause) return `Held on UADE: ${row.heldBecause}`;
  const n = score(row.uadeEnvelopeCorrelation);
  return n ? `nuade matches UADE at ${n} on ${row.corpus.length} song${row.corpus.length === 1 ? '' : 's'}` : 'Not measured yet';
}
