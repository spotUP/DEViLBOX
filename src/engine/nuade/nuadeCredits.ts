/**
 * Credits for nuade (Daniel Collin / emoon), single source: the notices block, the README sentence and the in-app text
 * all come from here. The format list in THIRD_PARTY_NOTICES.md is generated from the table
 * (`npx tsx tools/nuade/write-notices.ts`) and a test fails when it drifts.
 */
import { NUADE_FORMAT_LIST, NUADE_ENGINE_CREDIT } from './nuadeFormats';

export const NUADE_NOTICES_BEGIN = '<!-- nuade-formats:begin -->';
export const NUADE_NOTICES_END = '<!-- nuade-formats:end -->';

/** Labels of the formats that play through nuade by default, sorted, one per line as a markdown list. */
export function nuadeNoticesFormatBlock(): string {
  const labels = NUADE_FORMAT_LIST.filter((r) => r.defaultEngine === 'nuade').map((r) => r.label).sort((a, b) => a.localeCompare(b));
  return [NUADE_NOTICES_BEGIN, ...labels.map((l) => `  - ${l}`), NUADE_NOTICES_END].join('\n');
}

/** The in-app credit line for a song played by nuade: the engine credit, the format's label and the player id. */
export function nuadeSongCredit(label: string, playerId: string): string {
  return `${NUADE_ENGINE_CREDIT}. Format: ${label} (nuade player "${playerId}").`;
}

/** Rewrites the generated block inside the notices text; throws when the markers are missing. */
export function withNuadeNoticesBlock(notices: string): string {
  const a = notices.indexOf(NUADE_NOTICES_BEGIN);
  const b = notices.indexOf(NUADE_NOTICES_END);
  if (a < 0 || b < a) throw new Error('THIRD_PARTY_NOTICES.md has no nuade-formats markers');
  return notices.slice(0, a) + nuadeNoticesFormatBlock() + notices.slice(b + NUADE_NOTICES_END.length);
}
