/**
 * voice_to_notes: headless path for the Voice to Notes pipeline. An audio file
 * (base64 from the server, or a URL the browser fetches) is decoded, resampled
 * to 22050 Hz mono and run through the SAME core the panel uses
 * (lib/voice/voiceToNotes: shape, quantise, write) into the current pattern at
 * the cursor channel and row.
 */
import { basicPitchModel, resampleToMono22050, type PitchModel } from '@/lib/voice/basicPitchModel';
import { DEFAULT_SHAPING, commitVoiceNotes, shapeNotes } from '@/lib/voice/voiceToNotes';
import { loadActiveClassifier } from '@/lib/voice/drumModel';
import { detectHits, DRUM_CLASSES } from '@/lib/voice/drumHits';
import { commitDrumHits, defaultDrumMap, type DrumMap } from '@/lib/voice/drumToNotes';
import { SCALES, type ScaleName } from '@/lib/voice/scaleSnap';
import { getStoredLatencyMs } from '@/lib/voice/latencyCalibration';
import { useCursorStore } from '@/stores/useCursorStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useTransportStore } from '@/stores/useTransportStore';

export interface VoiceToNotesDeps {
  model: PitchModel;
  /** Audio bytes to 22050 Hz mono samples */
  decode: (bytes: ArrayBuffer) => Promise<Float32Array>;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
}

export const defaultVoiceDeps: VoiceToNotesDeps = {
  model: basicPitchModel,
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
    const quantise = { bpm, speed, swing: 0, minLengthRows: 1, latencyNudgeMs: getStoredLatencyMs('') };

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

    const output = await deps.model.evaluate(samples);
    const tonic = params.keyTonic as number | undefined;
    const scale = (params.keyScale as string | undefined) ?? 'major';
    if (tonic !== undefined && !(scale in SCALES)) return { error: `Unknown keyScale: ${scale}` };
    const notes = shapeNotes(output, {
      ...DEFAULT_SHAPING,
      transpose: (params.transpose as number | undefined) ?? 0,
      keySnap: tonic === undefined ? null : { tonic, scale: scale as ScaleName },
    });

    const instrumentId =
      (params.instrumentId as number | undefined) ?? useInstrumentStore.getState().currentInstrumentId ?? 1;
    const result = commitVoiceNotes(
      notes,
      quantise,
      { channelIndex, startRow, instrumentId },
    );
    if (!result) return { ok: true, written: 0, dropped: 0, detected: notes.length };
    return { ok: true, ...result, detected: notes.length, channel: channelIndex, row: startRow };
  } catch (e) {
    return { error: `voice_to_notes failed: ${(e as Error).message}` };
  }
}
