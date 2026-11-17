/** Live NES recording for the export dialog (needs the audio worklet): plays the song once per region and builds the ROM. */
import { useTransportStore, useTrackerStore, useFormatStore } from '@stores';
import { FurnaceDispatchEngine } from '../../../engine/furnace-dispatch/FurnaceDispatchEngine';
import { nesCaptureFromBatches, type NesCapture } from './nesCapture';
import { fetchNesPlayer, buildVrc6Cartridge } from './nesCartridge';
import { buildNsfe } from './nsfe';
import { NES_REGIONS, type NesRegion } from './nesStream';
import { buildNesRom, isSunsoft, nesChipsOf, wantsVrc6Cartridge, withClockSel, type NesRegionChoice, type NesRomInfo, type NesRomResult } from './nesExport';
import { orderPassLength } from '../vectrex/vectrexCapture';

const MAX_RECORD_MS = 10 * 60 * 1000;

/** One pass over the order list with the NES-family chips clocked for `region`. */
async function recordRegion(region: NesRegion, sunsoft: boolean): Promise<NesCapture> {
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

export type NesExportFormat = 'nes' | 'nsfe';

export async function recordNesRom(choice: NesRegionChoice, title: string, author?: string, comments?: string, format: NesExportFormat = 'nes'): Promise<NesRomResult & { tickRateHz: number }> {
  const native = useFormatStore.getState().furnaceNative;
  const chips = nesChipsOf(native?.chipIds, native?.chipFlags);
  if (!chips.length) throw new Error('This song has no NES-family sound chip.');
  const sunsoft = (native?.chipFlags ?? []).some(isSunsoft);
  const regions: NesRegion[] = choice === 'all' ? [...NES_REGIONS] : [choice];
  const caps: Partial<Record<NesRegion, NesCapture>> = {};
  for (const r of regions) caps[r] = await recordRegion(r, sunsoft);
  const first = caps[regions[0]]!;
  // The ntsc slot is the fallback of the other regions: a single recorded region fills it.
  const info: NesRomInfo = { title, author, comments, chips };
  const subsongs = [{ ntsc: first, pal: caps.pal, dendy: caps.dendy }];
  if (format === 'nsfe') {
    const n = buildNsfe(subsongs, await fetchNesPlayer(), info);
    return { rom: n.nsfe, banks: 0, streamBytes: 0, seconds: [], warnings: n.warnings, tickRateHz: first.tickRateHz };
  }
  const warnings: string[] = [];
  if (wantsVrc6Cartridge(chips)) {
    try {
      const v = buildVrc6Cartridge(subsongs, await fetchNesPlayer('player24'), title, { author, comments, chipName: 'VRC6' });
      return { ...v, warnings: ['Built the original VRC6 cartridge (mapper 24).'], tickRateHz: first.tickRateHz };
    } catch (e) {
      warnings.push(`Built the custom cartridge (mapper 31), not the original VRC6 board: ${e instanceof Error ? e.message : e}`);
    }
  }
  const rom = buildNesRom(subsongs, await fetchNesPlayer(), info);
  return { ...rom, warnings: [...warnings, ...rom.warnings], tickRateHz: first.tickRateHz };
}
