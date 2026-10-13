/**
 * Tracker samples as scratch records (owner plan
 * `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` sections 84, 85, 88 "tracker demo:
 * tracker sample"; ledger SCR-P5.6).
 *
 * A sample instrument of a tracker deck's song becomes a TRACKER_SAMPLE source: its audio is read at
 * 22,050 Hz the way the demo reads a record (`demoRecordPcm` from WAV bytes, `demoMonoPcm` from decoded
 * audio; no S950 - it stays the module's own sound) and its strokes render on the one stroke renderer like
 * any crate record's (PG-J). The record is transient: it lives in the pool for the deck's song, never in
 * the crate catalogue.
 */

import { SCRATCH_GESTURE_IDS } from './scratchGestureCatalog';
import { demoMonoPcm, demoRecordPcm } from './scratchGrit';
import { analyzeRecord } from './scratchBankAnalysis';
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
 * A transient scratch record for a sample read at 22,050 Hz (`pcm`), analysed at load the way the demo's bank
 * analyses a record it has no name for (R3: `analyze` + `_cue_points`): the attack at the first voiced onset, the
 * home on the loudest voiced frame (the vowel), the safe range where the envelope passes 6 % of its peak, forward
 * room from the vowel to the tail, reverse room back to the safe start; the acoustic fields from `analyze`.
 */
export function trackerSampleRecord(deck: AB, info: Pick<TrackerSampleInfo, 'sampleId' | 'name' | 'kind'>, pcm: ArrayLike<number>): ScratchRecord {
  const R = 22050;
  const durationSec = pcm.length / R;
  const { info: a, cues } = analyzeRecord(pcm, R);
  const sec = (i: number) => i / R;
  const vowel = sec(cues.vowel);
  const id = trackerSampleRecordId(deck, info.sampleId);
  const anchor = { position: vowel, safe: [sec(cues.safe[0]), sec(cues.safe[1])] as const, safeForward: [vowel, sec(cues.safeForward[1])] as const, safeReverse: [sec(cues.safeReverse[0]), vowel] as const };
  return {
    id, canonicalName: id, literalPhrase: info.name, file: '', sourceFile: '', url: '',
    demoCue: { anchor: cues.vowel, safe: cues.safe },
    category: info.kind === 'voice' ? 'SHORT_EXCLAMATION' : 'FX',
    referenceRoles: [], roles: ['ACCENT', 'ANSWER', 'FILL', 'THEME'], styles: [],
    recommendedGestures: [], gestures: SAMPLE_GESTURES,
    anchors: { attack: sec(cues.attack), vowel, tail: sec(cues.tail) },
    safe: anchor.safe, safeForward: anchor.safeForward, safeReverse: anchor.safeReverse,
    wordSlices: [], clean: !a.preScratched, preScratched: a.preScratched, durationSec,
    voicedAmount: a.voicedAmount, noiseAmount: a.noiseAmount, onsetRate: a.onsetRate, transientCount: a.transientCount, centroidHz: a.centroid,
    anchor,
  };
}

/** What the loader needs of the pool. */
export interface TransientRecordHost {
  registerTransientRecord(record: ScratchRecord, pcm: Float64Array): void;
  hasRecord(id: string): boolean;
}

/** Reachability sentinel (SCR-P5.6). */
export const trackerSampleStats = { loads: 0 };

/** A sample's audio at 22,050 Hz, mono, peak-normalised, no grit: from its WAV bytes, else decoded (any format). */
async function samplePcm(bytes: ArrayBuffer, ctx: Pick<BaseAudioContext, 'decodeAudioData'>): Promise<Float64Array> {
  try {
    return demoRecordPcm(bytes, 22050, { grit: false });
  } catch {
    const buffer = await ctx.decodeAudioData(bytes);
    const mono = new Float64Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] = mono[i]! + d[i]! / buffer.numberOfChannels;
    }
    return demoMonoPcm(mono, buffer.sampleRate, 22050, { grit: false });
  }
}

/**
 * Read a tracker deck's sample instrument at 22,050 Hz and register it with the pool as a transient record;
 * resolves with the record (null when the instrument has no sample). Loading the same deck + sample twice
 * reuses the first.
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
  const pcm = await samplePcm(bytes, ctx);
  const record = trackerSampleRecord(deck, info, pcm);
  if (!host.hasRecord(id)) {
    host.registerTransientRecord(record, pcm);
    trackerSampleStats.loads++;
  }
  return record;
}
