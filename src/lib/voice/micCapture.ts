/**
 * micCapture.ts - the browser VoiceCapture: a 22050 Hz AudioContext with the
 * voice-recorder AudioWorklet, plus metronome clicks on the same clock.
 */
import { PITCH_SAMPLE_RATE } from './pitchNotes';
import type { VoiceCapture, VoiceCaptureFactory } from './voiceRecorder';

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
  return {
    sampleRate: PITCH_SAMPLE_RATE,
    async start(onBlock) {
      await ctx.resume();
      await ctx.audioWorklet.addModule('/worklets/voice-recorder.worklet.js');
      node = new AudioWorkletNode(ctx, 'voice-recorder', { numberOfOutputs: 0 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data);
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
    stop() {
      source?.disconnect();
      node?.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
};
