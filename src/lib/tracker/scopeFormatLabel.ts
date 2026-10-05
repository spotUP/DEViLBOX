/**
 * What the scope view says it is playing: the chip and the format of the song
 * whose engine runs a player program (editor mode 'sc68'). The mode is shared
 * by SC68, SNDH, game music (game-music-emu), ASAP, AY and QSF, so the label
 * comes from the song's data, not the mode.
 */
import { gameMusicType, vgmChips, type GameMusicType } from '@lib/import/formats/GameMusicParser';
export interface ScopeFormatLabel { chip: string; format: string; platform: string }

export interface ScopeFormatSource {
  sndhFileData?: unknown; sc68FileData?: unknown; gmeFileData?: unknown; asapFileData?: unknown;
  ayFileData?: unknown; qsfFileData?: unknown;
}

const GAME_MUSIC: Record<GameMusicType, ScopeFormatLabel> = {
  NSF: { chip: '2A03', format: 'NSF', platform: 'NES' },
  NSFE: { chip: '2A03', format: 'NSFE', platform: 'NES' },
  GBS: { chip: 'DMG APU', format: 'GBS', platform: 'Game Boy' },
  HES: { chip: 'HuC6280', format: 'HES', platform: 'PC Engine' },
  KSS: { chip: 'AY-3-8910 + SCC', format: 'KSS', platform: 'MSX' },
  SPC: { chip: 'S-DSP', format: 'SPC', platform: 'Super Nintendo' },
  VGM: { chip: 'SN76489', format: 'VGM', platform: 'Sega' }, // chips read from the header below
  GYM: { chip: 'YM2612 + SN76489', format: 'GYM', platform: 'Mega Drive' },
};

export function scopeFormatLabel(f: ScopeFormatSource): ScopeFormatLabel | null {
  if (f.sndhFileData) return { chip: 'YM2149', format: 'SNDH', platform: 'Atari ST' };
  if (f.gmeFileData instanceof ArrayBuffer) {
    const type = gameMusicType(f.gmeFileData);
    // A GYM without its GYMX header has no magic; it is the only one that can.
    const label = GAME_MUSIC[type ?? 'GYM'];
    return type === 'VGM' ? { ...label, chip: vgmChips(f.gmeFileData) || label.chip } : label;
  }
  if (f.sc68FileData) return { chip: 'YM2149', format: 'SC68', platform: 'Atari ST' };
  if (f.asapFileData) return { chip: 'POKEY', format: 'SAP', platform: 'Atari 8-bit' };
  if (f.ayFileData) return { chip: 'AY-3-8912', format: 'AY', platform: 'ZX Spectrum' };
  if (f.qsfFileData) return { chip: 'QSound', format: 'QSF', platform: 'Capcom arcade' };
  return null;
}
