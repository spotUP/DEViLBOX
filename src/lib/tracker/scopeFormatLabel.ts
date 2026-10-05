/**
 * What the scope view says it is playing: the chip and the format of the song
 * whose engine runs a player program (editor mode 'sc68'). The mode is shared
 * by SC68, SNDH, ASAP, AY and QSF, so the label comes from the song's data,
 * not the mode.
 */
export interface ScopeFormatLabel { chip: string; format: string; platform: string }

export interface ScopeFormatSource {
  sndhFileData?: unknown; sc68FileData?: unknown; asapFileData?: unknown;
  ayFileData?: unknown; qsfFileData?: unknown;
}

export function scopeFormatLabel(f: ScopeFormatSource): ScopeFormatLabel | null {
  if (f.sndhFileData) return { chip: 'YM2149', format: 'SNDH', platform: 'Atari ST' };
  if (f.sc68FileData) return { chip: 'YM2149', format: 'SC68', platform: 'Atari ST' };
  if (f.asapFileData) return { chip: 'POKEY', format: 'SAP', platform: 'Atari 8-bit' };
  if (f.ayFileData) return { chip: 'AY-3-8912', format: 'AY', platform: 'ZX Spectrum' };
  if (f.qsfFileData) return { chip: 'QSound', format: 'QSF', platform: 'Capcom arcade' };
  return null;
}
