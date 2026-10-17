/**
 * useVoiceRecorder - microphone permission, device pick, level meter, count-in,
 * and the live loop, on top of the lib/voice recorder.
 *
 * While recording, `liveAudio` is the take so far (every LIVE_HOP_SECONDS) so
 * the waveform grows in place; with `livePreview` the same tick also runs the
 * pitch tracker and fills `liveNotes`.
 *
 * `deps` lets tests supply a fake MediaStream source and capture backend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceRecorder, type VoiceCaptureFactory } from '@/lib/voice/voiceRecorder';
import { createMicCapture, getMicStream } from '@/lib/voice/micCapture';
import { previewStep, LIVE_HOP_SECONDS } from '@/lib/voice/liveWindow';
import type { VoiceNote } from '@/lib/voice/pitchNotes';
import type { PitchTracker } from '@/lib/voice/pitchTrack';
import type { NoteShaping } from '@/lib/voice/voiceToNotes';

export type RecorderPhase = 'idle' | 'countIn' | 'recording';

export interface VoiceRecorderDeps {
  getStream: (deviceId?: string) => Promise<MediaStream>;
  createCapture: VoiceCaptureFactory;
  listDevices: () => Promise<MediaDeviceInfo[]>;
}

export const defaultVoiceRecorderDeps: VoiceRecorderDeps = {
  getStream: getMicStream,
  createCapture: createMicCapture,
  listDevices: async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'),
};

export interface StartOptions {
  deviceId?: string;
  countInBeats: number;
  beatSeconds: number;
  onTakeStart?: () => void;
  /** Run the pitch tracker on the growing take for live notes. Off for drum, training and level-check takes. Default on. */
  livePreview?: boolean;
}

export function useVoiceRecorder(tracker: PitchTracker, shaping: NoteShaping, deps: VoiceRecorderDeps = defaultVoiceRecorderDeps) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [liveNotes, setLiveNotes] = useState<VoiceNote[]>([]);
  const [liveAudio, setLiveAudio] = useState<Float32Array | null>(null);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const liveRef = useRef<VoiceNote[]>([]);
  const settingsRef = useRef(shaping);
  useEffect(() => {
    settingsRef.current = shaping;
  }, [shaping]);

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await deps.listDevices());
    } catch {
      setDevices([]);
    }
  }, [deps]);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async (opts: StartOptions) => {
    if (recorderRef.current) return;
    setError(null);
    setLiveNotes([]);
    setLiveAudio(null);
    liveRef.current = [];
    try {
      const stream = await deps.getStream(opts.deviceId);
      const recorder = new VoiceRecorder(deps.createCapture(stream), {
        countInBeats: opts.countInBeats,
        beatSeconds: opts.beatSeconds,
        onLevel: setLevel,
        onTakeStart: () => {
          setPhase('recording');
          opts.onTakeStart?.();
        },
      });
      recorderRef.current = recorder;
      setPhase(opts.countInBeats > 0 ? 'countIn' : 'recording');
      await recorder.start();
      void refreshDevices();
      timerRef.current = setInterval(() => {
        const current = recorderRef.current;
        if (!current) return;
        const take = current.snapshot();
        if (take.length === 0) return;
        setLiveAudio(take);
        if (opts.livePreview === false || busyRef.current) return;
        busyRef.current = true;
        previewStep(take, liveRef.current, tracker, settingsRef.current)
          .then((notes) => {
            liveRef.current = notes;
            setLiveNotes(notes);
          })
          // The take is still recorded; the live preview says why it stopped updating.
          .catch((err) => setError(`Live preview failed: ${err instanceof Error ? err.message : 'unknown error'}`))
          .finally(() => { busyRef.current = false; });
      }, LIVE_HOP_SECONDS * 1000);
    } catch (err) {
      recorderRef.current = null;
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Microphone unavailable');
    }
  }, [deps, tracker, refreshDevices]);

  /** Stop and return the take (22050 Hz mono), or null when nothing was recording. */
  const stop = useCallback(async (): Promise<Float32Array | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    clearTimer();
    recorderRef.current = null;
    setPhase('idle');
    setLevel(0);
    setLiveAudio(null);
    return recorder.stop();
  }, []);

  useEffect(() => () => {
    clearTimer();
    void recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  return { phase, level, error, devices, liveNotes, liveAudio, start, stop, refreshDevices };
}
