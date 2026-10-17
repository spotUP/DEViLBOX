/**
 * voice_to_notes: headless path for the Voice to Notes pipeline. An audio file
 * (base64 from the server, or a URL the browser fetches) is decoded, resampled
 * to 22050 Hz mono and run through the SAME core the panel uses
 * (lib/voice/voiceToNotes: shape, quantise, write) into the current pattern at
 * the cursor channel and row.
 */
import { resampleToMono22050 } from '@/lib/voice/basicPitchModel';
import { TRACK_VOICED_CONFIDENCE, type F0Track, type PitchTracker } from '@/lib/voice/pitchTrack';
import { swiftF0Tracker } from '@/lib/voice/swiftF0';
import { DEFAULT_SHAPING, commitVoiceNotes, shapeNotes } from '@/lib/voice/voiceToNotes';
import { ALL_EFFECTS, contourFromTrack } from '@/lib/voice/noteEffects';
import { PITCH_SAMPLE_RATE } from '@/lib/voice/pitchNotes';
import { countsByClass, loadActiveClassifier, modelClassifier, type TrainingSample } from '@/lib/voice/drumModel';
import { classifyByRules, detectHits, DRUM_CLASSES, type HitClassifier } from '@/lib/voice/drumHits';
import { commitDrumHits, defaultDrumMap, type DrumMap } from '@/lib/voice/drumToNotes';
import { SCALES, type ScaleName } from '@/lib/voice/scaleSnap';
import { getStoredLatencyMs } from '@/lib/voice/latencyCalibration';
import { useCursorStore } from '@/stores/useCursorStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useVoiceStore } from '@/stores/useVoiceStore';
import { spanRms, voiceGateLevel } from '@/lib/voice/voicing';

export interface VoiceToNotesDeps {
  tracker: PitchTracker;
  /** Audio bytes to 22050 Hz mono samples */
  decode: (bytes: ArrayBuffer) => Promise<Float32Array>;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
}

export const defaultVoiceDeps: VoiceToNotesDeps = {
  tracker: swiftF0Tracker,
  async decode(bytes) {
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(bytes);
      return (await resampleToMono22050(decoded)).getChannelData(0);
    } finally {
      void ctx.close();
    }
  },
  async fetchBytes(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  },
};

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function voiceToNotes(
  params: Record<string, unknown>,
  deps: VoiceToNotesDeps = defaultVoiceDeps,
): Promise<Record<string, unknown>> {
  const data = params.data as string | undefined;
  const url = params.url as string | undefined;
  if (!data && !url) return { error: 'Missing required params: data (base64) or url' };
  try {
    const bytes = data ? base64ToBuffer(data) : await deps.fetchBytes(url as string);
    const samples = await deps.decode(bytes);
    const mode = (params.mode as string | undefined) ?? 'melody';
    if (mode !== 'melody' && mode !== 'drums') return { error: `Unknown mode: ${mode}` };

    const cursor = useCursorStore.getState().cursor;
    const channelIndex = (params.channel as number | undefined) ?? cursor.channelIndex;
    const startRow = (params.row as number | undefined) ?? cursor.rowIndex;
    const { bpm, speed } = useTransportStore.getState();
    const quantise = { bpm, speed, swing: 0, minLengthRows: 1, latencyNudgeMs: getStoredLatencyMs(''), strength: 1, toleranceRows: 0.1 };

    if (mode === 'drums') {
      const fallback = (params.instrumentId as number | undefined) ?? useInstrumentStore.getState().currentInstrumentId ?? 1;
      const map: DrumMap = defaultDrumMap(useInstrumentStore.getState().instruments);
      const override = (params.drumMap ?? {}) as Record<string, { instrumentId?: number; midi?: number }>;
      for (const d of DRUM_CLASSES) {
        if (override[d]) map[d] = { ...map[d], ...override[d] };
      }
      const hits = detectHits(samples, loadActiveClassifier());
      const written = commitDrumHits(hits, map, quantise, { channelIndex, startRow, instrumentId: fallback });
      const counts = Object.fromEntries(DRUM_CLASSES.map((d) => [d, hits.filter((h) => h.drum === d).length]));
      if (!written) return { ok: true, written: 0, dropped: 0, detected: hits.length, hits: counts };
      return { ok: true, ...written, detected: hits.length, hits: counts, channel: channelIndex, row: startRow };
    }

    const track = await deps.tracker.track(samples);
    const tonic = params.keyTonic as number | undefined;
    const scale = (params.keyScale as string | undefined) ?? 'major';
    if (tonic !== undefined && !(scale in SCALES)) return { error: `Unknown keyScale: ${scale}` };
    const notes = shapeNotes(track, {
      ...DEFAULT_SHAPING,
      transpose: (params.transpose as number | undefined) ?? 0,
      keySnap: tonic === undefined ? null : { tonic, scale: scale as ScaleName },
    });

    const instrumentId =
      (params.instrumentId as number | undefined) ?? useInstrumentStore.getState().currentInstrumentId ?? 1;
    // Every effect on, as the panel's toggles default: the headless path has no UI.
    const take = { audio: samples, sampleRate: PITCH_SAMPLE_RATE };
    const result = commitVoiceNotes(
      notes,
      quantise,
      { channelIndex, startRow, instrumentId },
      take,
      contourFromTrack(track),
      ALL_EFFECTS,
    );
    if (!result) return { ok: true, written: 0, dropped: 0, detected: notes.length };
    return { ok: true, ...result, detected: notes.length, channel: channelIndex, row: startRow };
  } catch (e) {
    return { error: `voice_to_notes failed: ${(e as Error).message}` };
  }
}

/** Per true class: how the classifier labelled that class's training samples. */
function confusion(classify: HitClassifier, samples: readonly TrainingSample[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const s of samples) {
    const row = (out[s.drum] ??= {});
    const got = classify(s.features);
    row[got] = (row[got] ?? 0) + 1;
  }
  return out;
}

/** The drum training state: sample counts per class, accuracies, confusion of model and rules. */
function trainingReport(samples: readonly TrainingSample[], training: ReturnType<typeof useVoiceStore.getState>['training']) {
  return {
    samples: countsByClass(samples),
    result: training
      ? {
          modelAccuracy: training.modelAccuracy,
          rulesAccuracy: training.rulesAccuracy,
          heldOut: training.heldOut,
          useModel: training.useModel,
        }
      : null,
    modelConfusion: training ? confusion(modelClassifier(training.model), samples) : null,
    rulesConfusion: confusion(classifyByRules, samples),
  };
}

/**
 * The pitch track behind get_voice_take's notes: how much of the take the
 * tracker heard as voiced, how sure it was, and per note the mean pitch and
 * confidence of the frames under it.
 */
function trackSummary(
  track: F0Track,
  notes: readonly { startTimeSeconds: number; durationSeconds: number; pitchMidi: number }[],
  frames: boolean,
): Record<string, unknown> {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const voiced: number[] = [];
  for (let i = 0; i < track.hz.length; i++) {
    if (track.confidence[i] >= TRACK_VOICED_CONFIDENCE && track.hz[i] > 0) voiced.push(track.confidence[i]);
  }
  voiced.sort((a, b) => a - b);
  const perNote = notes.map((n) => {
    const from = Math.max(0, Math.floor(n.startTimeSeconds / track.hopSeconds));
    const to = Math.min(track.hz.length, Math.ceil((n.startTimeSeconds + n.durationSeconds) / track.hopSeconds));
    let hz = 0;
    let conf = 0;
    let count = 0;
    for (let i = from; i < to; i++) {
      if (track.hz[i] <= 0) continue;
      hz += track.hz[i];
      conf += track.confidence[i];
      count++;
    }
    return {
      start: round(n.startTimeSeconds),
      end: round(n.startTimeSeconds + n.durationSeconds),
      midi: n.pitchMidi,
      meanHz: count ? round(hz / count) : null,
      meanConfidence: count ? round(conf / count) : null,
    };
  });
  return {
    frames: track.hz.length,
    hopSeconds: track.hopSeconds,
    voicedFrames: voiced.length,
    medianConfidence: voiced.length ? round(voiced[voiced.length >> 1]) : null,
    perNote,
    ...(frames
      ? {
          hz: Array.from(track.hz, round),
          confidence: Array.from(track.confidence, round),
          loudnessDb: Array.from(track.loudnessDb, round),
        }
      : {}),
  };
}

/** Envelope step of get_voice_take, seconds. */
const ENVELOPE_STEP_SECONDS = 0.1;

function toDb(rms: number): number {
  return Math.round(20 * Math.log10(Math.max(rms, 1e-6)) * 10) / 10;
}

/**
 * get_voice_take: the take the Voice to Notes panel holds, as numbers. Take
 * length against the voiced span (RMS per 0.1 s over the take's own gate) and
 * the notes the current fine settings shape from the stored pitch track, so
 * "it stops before I stop" and "extra wrong notes" are measured from the real
 * recording instead of guessed. The track is summarised (voiced frames, median
 * confidence, per note mean Hz and confidence); `frames: true` adds the
 * per-frame hz, confidence and loudness arrays. Read-only.
 */
export function getVoiceTake(params: Record<string, unknown> = {}): Record<string, unknown> {
  const { take, takes, fine, mode, samples, training } = useVoiceStore.getState();
  if (!take) return { ok: false, error: 'No take recorded', takes: takes.length, mode };
  const notes = take.track
    ? shapeNotes(take.track, {
        ...fine,
        keySnap: fine.keySnapOn ? { tonic: fine.keyTonic, scale: fine.keyScale } : null,
      })
    : [];
  const gate = voiceGateLevel(take.audio);
  const envelopeDb: number[] = [];
  let voicedFrom: number | null = null;
  let voicedTo: number | null = null;
  for (let t = 0; t < take.seconds; t += ENVELOPE_STEP_SECONDS) {
    const level = spanRms(take.audio, take.sampleRate, t, ENVELOPE_STEP_SECONDS);
    envelopeDb.push(toDb(level));
    if (level > gate) {
      voicedFrom ??= t;
      voicedTo = t + ENVELOPE_STEP_SECONDS;
    }
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ok: true,
    id: take.id,
    mode: take.mode,
    recordedAt: new Date(take.recordedAt).toISOString(),
    seconds: round(take.seconds),
    sampleRate: take.sampleRate,
    samples: take.audio.length,
    gateDb: toDb(gate),
    voicedFrom: voicedFrom === null ? null : round(voicedFrom),
    voicedTo: voicedTo === null ? null : round(voicedTo),
    envelopeDb,
    track: take.track ? trackSummary(take.track, notes, params.frames === true) : null,
    notes: notes.map((n) => ({
      start: round(n.startTimeSeconds),
      duration: round(n.durationSeconds),
      midi: n.pitchMidi,
      amplitude: round(n.amplitude),
    })),
    lastNoteEnd: notes.length ? round(Math.max(...notes.map((n) => n.startTimeSeconds + n.durationSeconds))) : null,
    hits: take.hits.map((h) => ({ time: round(h.timeSeconds), drum: h.drum, strength: round(h.strength) })),
    takes: takes.length,
    training: trainingReport(samples, training),
    fine: {
      pitchHoldMs: fine.pitchHoldMs,
      voicingThreshold: fine.voicingThreshold,
      minNoteLengthMs: fine.minNoteLengthMs,
      transpose: fine.transpose,
      keySnapOn: fine.keySnapOn,
    },
  };
}
