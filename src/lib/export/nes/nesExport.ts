/**
 * NES ROM export, pure part: availability, warnings and the ROM build from finished captures. The live recording
 * (needs the audio worklet) is in nesRecord.ts. Export targets: custom mapper-31 cart, VRC6 mapper-24 cart, NSFe.
 */
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { chipKeyPlatform } from '../../../engine/furnace-dispatch/chipKey';
import { buildNesCartridge, type NesCartridgeResult, type NesPlayer } from './nesCartridge';
import { NES_REGION_TIMING, NES_REGIONS, type NesRegion, type NesSubsongInput } from './nesStream';
import { nesChipOfPlatform } from './nesCapture';

/** Region choice in the dialog: one region recorded, or all three (three real-time passes). */
export type NesRegionChoice = NesRegion | 'all';

export const NES_REGION_LABELS: Record<NesRegionChoice, string> = {
  all: 'All regions (three recordings)', ntsc: 'NTSC', pal: 'PAL', dendy: 'Dendy',
};

/** Furnace clockSel per region (nes.cpp setFlags: 0 NTSC, 1 PAL, 2 Dendy). */
export const NES_CLOCK_SEL: Record<NesRegion, number> = { ntsc: 0, pal: 1, dendy: 2 };

const chipName: Record<string, string> = { nes: '2A03', vrc6: 'VRC6', vrc7: 'VRC7', fds: 'FDS', mmc5: 'MMC5', n163: 'N163', s5b: '5B' };

/** True when the song uses a platform the NES native player can play. The AY counts only with the Sunsoft flag (5B). */
export function nesRomExportAvailable(chipIds: readonly number[] | undefined, chipFlags?: readonly string[]): boolean {
  return nesChipsOf(chipIds, chipFlags).length > 0;
}

export function nesChipsOf(chipIds: readonly number[] | undefined, chipFlags?: readonly string[]): string[] {
  const out: string[] = [];
  (chipIds ?? []).forEach((id, i) => {
    const c = nesChipOfPlatform(chipKeyPlatform(id), id === FurnaceDispatchPlatform.AY8910 && isSunsoft(chipFlags?.[i]));
    if (c) out.push(c);
  });
  return out;
}

export function isSunsoft(flags: string | undefined): boolean {
  return /^sunsoft=(true|1)$/m.test(flags ?? '');
}

/** Chip flags with clockSel set for a region (other keys kept). */
export function withClockSel(flags: string | undefined, region: NesRegion): string {
  const rest = (flags ?? '').split('\n').filter((l) => l && !l.startsWith('clockSel='));
  return [...rest, `clockSel=${NES_CLOCK_SEL[region]}`].join('\n') + '\n';
}

/** Warning when the song tick rate (BPM * 2 / 5) is not the frame rate of every region the cart will play in; null when 1:1. */
export function nesTempoWarning(bpm: number, regions: readonly NesRegion[] = NES_REGIONS): string | null {
  const hz = bpm * 2 / 5;
  const off = regions.filter((r) => Math.abs(hz - NES_REGION_TIMING[r].frameHz) / NES_REGION_TIMING[r].frameHz > 0.005);
  if (!off.length) return null;
  return `This song ticks at ${hz.toFixed(2)} Hz (BPM ${bpm}). The ${off.map((r) => `${r.toUpperCase()} frame rate is ${NES_REGION_TIMING[r].frameHz} Hz`).join(', ')}. The cartridge then ticks on a cycle timer that exists on a custom board only, not on a stock console or in most emulators.`;
}

export interface NesRomInfo { title: string; author?: string; comments?: string; chips: readonly string[] }

export interface NesRomResult extends NesCartridgeResult { warnings: string[] }

/** Builds the custom-cart ROM from the captures and adds the size warnings. */
export function buildNesRom(subsongs: readonly NesSubsongInput[], player: NesPlayer, info: NesRomInfo): NesRomResult {
  const cart = buildNesCartridge(subsongs, player, info.title, 'ntsc', 0, {
    author: info.author, comments: info.comments, chipName: [...new Set(info.chips.map((c) => chipName[c] ?? c))].join(' ') || 'NES',
  });
  const warnings: string[] = [];
  if (cart.rom.length > 512 * 1024) warnings.push(`The ROM is ${Math.round(cart.rom.length / 1024)} KB. Many flash carts and emulators handle mapper 31 up to 512 KB only.`);
  if (info.chips.length > 1) warnings.push('Several sound chips in one cartridge need a custom board; no stock console or emulator decodes them together.');
  if (subsongs.some((s) => s.ntsc.events.some((e) => e.kind === 'control' && e.control === 4))) warnings.push('The song switches DPCM banks mid-sample. Mesen2 applies this correctly; real hardware is untested.');
  return { ...cart, warnings };
}

/** The original Sunsoft 5B (FME-7, mapper 69) board carries 2A03 + 5B only. */
export function wantsFme7Cartridge(chips: readonly string[]): boolean {
  return chips.includes('s5b') && chips.every((c) => c === 'nes' || c === 's5b');
}

/** The original VRC6 board carries 2A03 + VRC6 only; any song with a VRC6 and no other expansion chip may try it. */
export function wantsVrc6Cartridge(chips: readonly string[]): boolean {
  return chips.includes('vrc6') && chips.every((c) => c === 'nes' || c === 'vrc6');
}
