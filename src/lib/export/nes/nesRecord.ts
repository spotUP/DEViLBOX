/** Live NES recording for the export dialog (needs the audio worklet): plays the song once per region and builds the ROM. */
import { useTransportStore, useTrackerStore, useFormatStore } from '@stores';
import { FurnaceDispatchEngine } from '../../../engine/furnace-dispatch/FurnaceDispatchEngine';
import { nesCaptureFromBatches, type NesCapture } from './nesCapture';
import { fetchNesPlayer, buildBoardCartridge } from './nesCartridge';
import { buildNsfe } from './nsfe';
import { NES_REGIONS, type NesRegion, type NesSubsongInput } from './nesStream';
import { buildNesRom, isSunsoft, nesChipsOf, wantsFme7Cartridge, wantsN163Cartridge, wantsVrc6Cartridge, wantsVrc7Cartridge, withClockSel, type NesRegionChoice, type NesRomInfo, type NesRomResult } from './nesExport';
import { switchSubsong } from '../../tracker/subsongSwitch';
import { orderPassLength } from '../vectrex/vectrexCapture';

const MAX_RECORD_MS = 10 * 60 * 1000;

/** One pass over the order list with the NES-family chips clocked for `region`. */
export async function recordRegion(region: NesRegion, sunsoft: boolean): Promise<NesCapture> {
  const transport = useTransportStore.getState();
  const { patterns, patternOrder } = useTrackerStore.getState();
  const pass = orderPassLength(patterns, patternOrder.length ? patternOrder : patterns.map((_, i) => i), transport.speed);
  const native = useFormatStore.getState().furnaceNative;
  const savedFlags = native?.chipFlags;
  // Chip flags are applied at play start from the format store: set the region clock there, put the song's own back after.
  if (native) useFormatStore.setState({ furnaceNative: { ...native, chipFlags: native.chipIds.map((_, i) => withClockSel(savedFlags?.[i], region)) } });
  const tickRateHz = transport.bpm * 2 / 5;
  const wasPlaying = transport.isPlaying;
  const wasLooping = transport.isLooping;
  const d = FurnaceDispatchEngine.getInstance();
  try {
    if (wasPlaying) transport.stop();
    transport.setIsLooping(false);
    d.startRegCapture();
    await transport.play();
    const t0 = Date.now();
    // The Furnace engine wraps the order list instead of ending: stop after one pass.
    while (useTransportStore.getState().isPlaying && useTransportStore.getState().continuousRow < pass.rows && Date.now() - t0 < MAX_RECORD_MS) {
      await new Promise((r) => setTimeout(r, 200));
    }
    d.stopRegCapture();
    await new Promise((r) => setTimeout(r, 100)); // the last tick's batch may still be in flight
  } finally {
    useTransportStore.getState().stop();
    useTransportStore.getState().setIsLooping(wasLooping);
    const cur = useFormatStore.getState().furnaceNative;
    if (cur) useFormatStore.setState({ furnaceNative: { ...cur, chipFlags: savedFlags } });
  }
  const batches = d.getRegCaptureBatches();
  if (!batches.length) throw new Error('Nothing was recorded. Play the song once to unlock audio, then export again.');
  const origin = batches[0].sample;
  return nesCaptureFromBatches(batches.map((b) => ({ ...b, sample: b.sample - origin })), d.regCaptureSampleRate, tickRateHz, { sunsoft });
}

export type NesSubsongChoice = 'current' | 'all';
export type NesExportFormat = 'nes' | 'nsfe';
/** Original VRC6 board wiring: VRC6a (mapper 24, Akumajou Densetsu) or VRC6b (mapper 26, Madara / Esper Dream 2; A0 and A1 swapped). */
export type NesVrc6Board = 'vrc6a' | 'vrc6b';

export async function recordNesRom(choice: NesRegionChoice, title: string, author?: string, comments?: string, format: NesExportFormat = 'nes', subsongChoice: NesSubsongChoice = 'current', vrc6Board: NesVrc6Board = 'vrc6a'): Promise<NesRomResult & { tickRateHz: number }> {
  const native = useFormatStore.getState().furnaceNative;
  const chips = nesChipsOf(native?.chipIds, native?.chipFlags);
  if (!chips.length) throw new Error('This song has no NES-family sound chip.');
  const sunsoft = (native?.chipFlags ?? []).some(isSunsoft);
  const regions: NesRegion[] = choice === 'all' ? [...NES_REGIONS] : [choice];
  const fmt = useFormatStore.getState();
  const startSubsong = fmt.furnaceActiveSubsong;
  const indices = subsongChoice === 'all' && fmt.furnaceSubsongs?.length ? fmt.furnaceSubsongs.map((_, i) => i) : [startSubsong];
  const subsongs: NesSubsongInput[] = [];
  try {
    for (const i of indices) {
      if (indices.length > 1) await switchSubsong(i);
      const caps: Partial<Record<NesRegion, NesCapture>> = {};
      for (const r of regions) caps[r] = await recordRegion(r, sunsoft);
      // The ntsc slot is the fallback of the other regions: a single recorded region fills it.
      subsongs.push({ ntsc: caps[regions[0]]!, pal: caps.pal, dendy: caps.dendy });
    }
  } finally {
    if (indices.length > 1) await switchSubsong(startSubsong);
  }
  const first = subsongs[0].ntsc;
  const info: NesRomInfo = { title, author, comments, chips };
  if (format === 'nsfe') {
    const n = buildNsfe(subsongs, await fetchNesPlayer(), info);
    return { rom: n.nsfe, banks: 0, streamBytes: 0, seconds: [], warnings: n.warnings, tickRateHz: first.tickRateHz };
  }
  const warnings: string[] = [];
  if (wantsVrc6Cartridge(chips)) {
    try {
      const mapper = vrc6Board === 'vrc6b' ? 26 : 24;
      const v = buildBoardCartridge('vrc6', subsongs, await fetchNesPlayer(vrc6Board === 'vrc6b' ? 'player26' : 'player24'), title, { author, comments, chipName: 'VRC6' });
      return { ...v, warnings: [`Built the original VRC6 cartridge (mapper ${mapper}).`], tickRateHz: first.tickRateHz };
    } catch (e) {
      warnings.push(`Built the custom cartridge (mapper 31), not the original VRC6 board: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (wantsFme7Cartridge(chips)) {
    try {
      const v = buildBoardCartridge('fme7', subsongs, await fetchNesPlayer('player69'), title, { author, comments, chipName: '5B' });
      return { ...v, warnings: ['Built the original Sunsoft 5B cartridge (mapper 69).'], tickRateHz: first.tickRateHz };
    } catch (e) {
      warnings.push(`Built the custom cartridge (mapper 31), not the original Sunsoft 5B board: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (wantsN163Cartridge(chips)) {
    try {
      const v = buildBoardCartridge('n163', subsongs, await fetchNesPlayer('player19'), title, { author, comments, chipName: 'N163' });
      return { ...v, warnings: ['Built the original Namco 163 cartridge (mapper 19).'], tickRateHz: first.tickRateHz };
    } catch (e) {
      warnings.push(`Built the custom cartridge (mapper 31), not the original Namco 163 board: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (wantsVrc7Cartridge(chips)) {
    try {
      const v = buildBoardCartridge('vrc7', subsongs, await fetchNesPlayer('player85'), title, { author, comments, chipName: 'VRC7' });
      return { ...v, warnings: ['Built the original VRC7 cartridge (mapper 85).'], tickRateHz: first.tickRateHz };
    } catch (e) {
      warnings.push(`Built the custom cartridge (mapper 31), not the original VRC7 board: ${e instanceof Error ? e.message : e}`);
    }
  }
  const rom = buildNesRom(subsongs, await fetchNesPlayer(), info);
  return { ...rom, warnings: [...warnings, ...rom.warnings], tickRateHz: first.tickRateHz };
}
