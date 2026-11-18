/** Live NES recording for the export dialog (needs the audio worklet): plays the song once per region and builds the ROM. */
import { useTransportStore, useTrackerStore, useFormatStore } from '@stores';
import { FurnaceDispatchEngine } from '../../../engine/furnace-dispatch/FurnaceDispatchEngine';
import { nesCaptureFromBatches, type NesCapture } from './nesCapture';
import { fetchNesPlayer } from './nesCartridge';
import { buildNsfe } from './nsfe';
import { NES_REGIONS, type NesRegion, type NesSubsongInput } from './nesStream';
import { isSunsoft, nesChipsOf, withClockSel, type NesRegionChoice, type NesRomInfo, type NesRomResult } from './nesExport';
import { buildFamistudioRom, furnaceToFamistudio, type FamistudioMeta } from './famistudioSong';
import { saveFurFileWasm } from '../../import/wasm/FurnaceFileOps';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
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

/** NES cartridge: the live song as FamiStudio song data inside the FamiStudio sound engine ROM (2A03, plus the three VRC6 channels on a mapper-24 board; other expansion chips are dropped and listed in the warnings). */
export async function exportNesFamistudioRom(title: string, author?: string): Promise<{ rom: Uint8Array; warnings: string[] }> {
  const native = useFormatStore.getState().furnaceNative;
  if (!nesChipsOf(native?.chipIds, native?.chipFlags).includes('nes')) throw new Error('This song has no NES 2A03 channels.');
  const base = import.meta.env.BASE_URL;
  const load = async (name: string): Promise<{ player: ArrayBuffer; meta: FamistudioMeta }> => {
    const [player, meta] = await Promise.all([
      fetch(`${base}nes/famistudio/${name}.nes`).then((r) => r.arrayBuffer()),
      fetch(`${base}nes/famistudio/${name}.json`).then((r) => r.json() as Promise<FamistudioMeta>),
    ]);
    return { player, meta };
  };
  const [plain, fur] = await Promise.all([load('player'), saveFurFileWasm()]); // fur: the module the engine holds, as the .fur export reads it
  const m = await parseFurnaceSong(fur instanceof ArrayBuffer ? fur : new Uint8Array(fur).buffer);
  const song = furnaceToFamistudio(m, useFormatStore.getState().furnaceActiveSubsong, plain.meta.dpcmCap);
  const { player, meta } = song.vrc6 ? await load('player-vrc6') : plain; // 2A03 + VRC6: the mapper-24 build of the same engine
  const rom = buildFamistudioRom(new Uint8Array(player), meta, song, { title, author });
  return { rom, warnings: song.lossy.map((l) => `Not carried to the FamiStudio engine: ${l}`) };
}

/** NSFe: records the song per region (live worklet) and writes the register streams for the NSF player. */
export async function recordNsfe(choice: NesRegionChoice, title: string, author?: string, comments?: string, subsongChoice: NesSubsongChoice = 'current'): Promise<NesRomResult & { tickRateHz: number }> {
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
  const n = buildNsfe(subsongs, await fetchNesPlayer(), info);
  return { rom: n.nsfe, banks: 0, streamBytes: 0, seconds: [], warnings: n.warnings, tickRateHz: first.tickRateHz };
}
