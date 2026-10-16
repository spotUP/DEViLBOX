/**
 * useVoiceRecorder - microphone permission, device pick, level meter, count-in,
 * and the live preview loop, on top of the lib/voice recorder.
 *
 * `deps` lets tests supply a fake MediaStream source and capture backend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceRecorder, type VoiceCaptureFactory } from '@/lib/voice/voiceRecorder';
import { createMicCapture, getMicStream } from '@/lib/voice/micCapture';
import { previewStep, LIVE_HOP_SECONDS } from '@/lib/voice/liveWindow';
import type { PitchModel } from '@/lib/voice/basicPitchModel';
import type { PitchSettings, VoiceNote } from '@/lib/voice/pitchNotes';

export type RecorderPhase = 'idle' | 'countIn' | 'recording';

export interface VoiceRecorderDeps {
  getStream: (deviceId?: string) => Promise<MediaStream>;
  createCapture: VoiceCaptureFactory;
  listDevices: () => Promise<MediaDeviceInfo[]>;
}

const defaultDeps: VoiceRecorderDeps = {
  getStream: getMicStream,
  createCapture: createMicCapture,
  listDevices: async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'),
};

export interface StartOptions {
  deviceId?: string;
  countInBeats: number;
  beatSeconds: number;
  onTakeStart?: () => void;
}

export function useVoiceRecorder(model: PitchModel, pitchSettings: PitchSettings, deps: VoiceRecorderDeps = defaultDeps) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [liveNotes, setLiveNotes] = useState<VoiceNote[]>([]);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const liveRef = useRef<VoiceNote[]>([]);
  const settingsRef = useRef(pitchSettings);
  settingsRef.current = pitchSettings;

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
        if (busyRef.current || !recorderRef.current) return;
        const take = recorderRef.current.snapshot();
        if (take.length === 0) return;
        busyRef.current = true;
        previewStep(take, liveRef.current, model, settingsRef.current)
          .then((notes) => {
            liveRef.current = notes;
            setLiveNotes(notes);
          })
          .catch(() => { /* advisory only */ })
          .finally(() => { busyRef.current = false; });
      }, LIVE_HOP_SECONDS * 1000);
    } catch (err) {
      recorderRef.current = null;
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Microphone unavailable');
    }
  }, [deps, model, refreshDevices]);

  /** Stop and return the take (22050 Hz mono), or null when nothing was recording. */
  const stop = useCallback((): Float32Array | null => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    clearTimer();
    recorderRef.current = null;
    setPhase('idle');
    setLevel(0);
    return recorder.stop();
  }, []);

  useEffect(() => () => {
    clearTimer();
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  return { phase, level, error, devices, liveNotes, start, stop, refreshDevices };
}
