/**
 * micCapture.ts - the browser VoiceCapture: a 22050 Hz AudioContext with the
 * voice-recorder AudioWorklet, plus metronome clicks on the same clock.
 */
import { PITCH_SAMPLE_RATE } from './pitchNotes';
import type { VoiceCapture, VoiceCaptureFactory } from './voiceRecorder';

/** How long stop() waits for the worklet to answer the flush before it gives up. */
export const FLUSH_TIMEOUT_MS = 200;

export function getMicStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
}

export const createMicCapture: VoiceCaptureFactory = (stream): VoiceCapture => {
  const ctx = new AudioContext({ sampleRate: PITCH_SAMPLE_RATE });
  let node: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let flushed: (() => void) | null = null;
  return {
    sampleRate: PITCH_SAMPLE_RATE,
    async start(onBlock) {
      await ctx.resume();
      await ctx.audioWorklet.addModule('/worklets/voice-recorder.worklet.js');
      node = new AudioWorkletNode(ctx, 'voice-recorder', { numberOfOutputs: 0 });
      node.port.onmessage = (e: MessageEvent<Float32Array | 'flushed'>) => {
        if (e.data === 'flushed') flushed?.();
        else onBlock(e.data);
      };
      source = ctx.createMediaStreamSource(stream);
      source.connect(node);
    },
    click(delaySeconds, accent) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + delaySeconds;
      osc.frequency.value = accent ? 1600 : 1000;
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    },
    async stop() {
      // Collect the blocks still on their way from the worklet before tearing down.
      if (node) {
        const port = node.port;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
          flushed = () => {
            clearTimeout(timer);
            resolve();
          };
          port.postMessage('flush');
        });
        flushed = null;
      }
      source?.disconnect();
      node?.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
};
