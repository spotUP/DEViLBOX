/**
 * Tracker samples as scratch records (owner plan
 * `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` sections 84, 85, 88 "tracker demo:
 * tracker sample"; ledger SCR-P5.6).
 *
 * A sample instrument of a tracker deck's song becomes a TRACKER_SAMPLE source: its bytes are
 * decoded at the context's rate and written into a scratch record voice's ring like any crate
 * record (the record voice, section 16 - no second transport). The record is transient: it
 * lives in the voice pool for the deck's song, never in the crate catalogue.
 */

import { SCRATCH_GESTURE_IDS } from './scratchGestureCatalog';
import type { ScratchRecord } from './scratchCatalogue';
import type { TrackerSampleInfo } from './ScratchSourceSelector';
import type { ScratchGestureId } from './scratchTypes';

type AB = 'A' | 'B';

/** The record id a deck's tracker sample is performed under (`fireDjFx(..., {record})`). */
export const trackerSampleRecordId = (deck: AB, sampleId: string): string => `TRACKER_${deck}_${sampleId}`;

/** The slice of an instrument this module reads (`InstrumentConfig`). */
export interface TrackerSampleInstrument {
  id: number | string;
  name?: string;
  sample?: { audioBuffer?: ArrayBuffer; url?: string } | null;
  drumMachine?: { drumType?: string } | null;
}

const hasSample = (i: TrackerSampleInstrument): boolean =>
  !!i.sample && ((i.sample.audioBuffer instanceof ArrayBuffer && i.sample.audioBuffer.byteLength > 44) || !!i.sample.url);

/** Which kind of hit an instrument is, from its drum type or its name (a sample name is a weak hint). */
export function trackerSampleKind(i: TrackerSampleInstrument): TrackerSampleInfo['kind'] {
  const text = `${i.drumMachine?.drumType ?? ''} ${i.name ?? ''}`.toLowerCase();
  if (/\b(kick|bd|bass ?drum)\b/.test(text)) return 'kick';
  if (/\b(snare|sd|snr|clap)\b/.test(text)) return 'snare';
  if (/\b(vox|voc|voice|vocal|yeah|ahh?|hey|word|speech)\b/.test(text)) return 'voice';
  if (/\b(hat|hh|perc|tom|rim|cymbal|crash|ride|shaker|conga|bongo)\b/.test(text)) return 'percussion';
  return 'stab';
}

/** The scratchable sample instruments of a deck's song (instruments with sample data). */
export function trackerSampleInfos(instruments: readonly TrackerSampleInstrument[], deck: AB, used?: readonly number[]): TrackerSampleInfo[] {
  return instruments
    .filter((i) => hasSample(i) && (!used || used.includes(Number(i.id))))
    .map((i) => ({ deck, sampleId: String(i.id), name: i.name ?? '', kind: trackerSampleKind(i) }));
}

/** Every gesture but the throws of a pre-scratched one-shot: a tracker sample is clean vinyl. */
const SAMPLE_GESTURES: readonly ScratchGestureId[] = SCRATCH_GESTURE_IDS;

/**
 * A transient scratch record for a decoded sample: attack at 0, the home (vowel) 15 ms in or a
 * quarter of a short sample, the whole sample safe, forward room from the home to the end,
 * reverse room back to the attack. `durationSec` = frames / the buffer's rate.
 */
export function trackerSampleRecord(deck: AB, info: Pick<TrackerSampleInfo, 'sampleId' | 'name' | 'kind'>, buffer: Pick<AudioBuffer, 'length' | 'sampleRate'>): ScratchRecord {
  const durationSec = buffer.length / buffer.sampleRate;
  const vowel = Math.min(0.015, durationSec / 4);
  const id = trackerSampleRecordId(deck, info.sampleId);
  const anchor = { position: vowel, safe: [0, durationSec] as const, safeForward: [vowel, durationSec] as const, safeReverse: [0, vowel] as const };
  return {
    id, canonicalName: id, literalPhrase: info.name, file: '', sourceFile: '', url: '',
    category: info.kind === 'voice' ? 'SHORT_EXCLAMATION' : 'FX',
    referenceRoles: [], roles: ['ACCENT', 'ANSWER', 'FILL', 'THEME'], styles: [],
    recommendedGestures: [], gestures: SAMPLE_GESTURES,
    anchors: { attack: 0, vowel, tail: durationSec },
    safe: anchor.safe, safeForward: anchor.safeForward, safeReverse: anchor.safeReverse,
    wordSlices: [], clean: true, preScratched: false, durationSec,
    voicedAmount: info.kind === 'voice' ? 0.8 : 0.3, noiseAmount: 0, onsetRate: 0, transientCount: 1, centroidHz: 0,
    anchor,
  };
}

/** What the loader needs of the voice pool. */
export interface TransientRecordHost {
  registerTransientRecord(record: ScratchRecord, buffer: AudioBuffer): void;
  hasRecord(id: string): boolean;
}

/** Reachability sentinel (SCR-P5.6). */
export const trackerSampleStats = { loads: 0 };

/**
 * Decode a tracker deck's sample instrument at the context's rate and register it with the pool
 * as a transient record; resolves with the record (null when the instrument has no sample).
 * Loading the same deck + sample twice reuses the first.
 */
export async function loadTrackerSample(
  host: TransientRecordHost,
  ctx: Pick<BaseAudioContext, 'decodeAudioData'>,
  deck: AB,
  instrument: TrackerSampleInstrument,
  fetcher: (url: string) => Promise<ArrayBuffer> = async (url) => (await fetch(url)).arrayBuffer(),
): Promise<ScratchRecord | null> {
  if (!hasSample(instrument)) return null;
  const info = { sampleId: String(instrument.id), name: instrument.name ?? '', kind: trackerSampleKind(instrument) };
  const id = trackerSampleRecordId(deck, info.sampleId);
  const bytes = instrument.sample!.audioBuffer && instrument.sample!.audioBuffer.byteLength > 44
    ? instrument.sample!.audioBuffer.slice(0)
    : await fetcher(instrument.sample!.url!);
  const buffer = await ctx.decodeAudioData(bytes);
  const record = trackerSampleRecord(deck, info, buffer);
  if (!host.hasRecord(id)) {
    host.registerTransientRecord(record, buffer);
    trackerSampleStats.loads++;
  }
  return record;
}
