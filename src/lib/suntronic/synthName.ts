/**
 * Descriptive naming for SunTronic V1.3 synth instruments.
 *
 * The V1.3 format stores NO name for a synth record (only sampled instruments
 * carry entries in `instrumentNames`), so the parser historically fell back to
 * a bare `Synth N`. That tells the user nothing about the sound.
 *
 * Everything here is derived from FACTS already decoded on the config — the
 * synthesis type (record+0x23) plus whether the arp/vibrato tables actually
 * carry non-trivial data — never a guess about the musical role. Deterministic
 * so the same module always names its instruments the same way.
 */
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';

/** Human label for a SunTronic `synthType` (record+0x23). */
export function sunSynthTypeLabel(synthType: number): string {
  switch (synthType) {
    case 0: return 'Morph';
    case 1: return 'Pulse-Noise';
    case 2: return 'Splice';
    case 3: return 'Resample';
    default: return 'Smooth';
  }
}

/** A table carries real modulation if any entry past the first is non-zero. */
function tableHasMotion(table: number[] | undefined, len: number): boolean {
  if (!table || len <= 1) return false;
  const first = table[0] ?? 0;
  for (let i = 1; i < len && i < table.length; i++) {
    if ((table[i] ?? 0) !== first) return true;
  }
  return false;
}

/**
 * Build a descriptive, deterministic name for a decoded synth record.
 * `index` is the zero-based synth slot; the returned name is 1-based so it
 * lines up with the slot number a user sees.
 *
 * Shape: `<Type>[ Arp][ Vibrato] <n>` — e.g. "Morph Arp 3", "Splice 7".
 */
export function sunSynthDescriptiveName(cfg: SunTronicConfig, index: number): string {
  let name = sunSynthTypeLabel(cfg.synthType);
  if (tableHasMotion(cfg.arpTable, cfg.arpLen)) name += ' Arp';
  if (tableHasMotion(cfg.vibDepth, cfg.freqEnvLen)) name += ' Vibrato';
  return `${name} ${index + 1}`;
}
