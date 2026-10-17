/**
 * latencyCalibration.ts - per-input-device round-trip latency.
 *
 * Loopback: play a click through the output, record it on the microphone, and
 * measure how long after the click was scheduled it arrived. The result is
 * stored per input device id (localStorage, versioned key) and is added to the
 * panel's manual Latency nudge when a take is quantised.
 */
import { PITCH_SAMPLE_RATE } from './pitchNotes';
import { concatBlocks, type VoiceCapture } from './voiceRecorder';
import { clearDrumsReset, drumsResetPending } from '@/lib/persistence/migrations/voiceDrumsV2';

export const LATENCY_STORAGE_KEY = 'devilbox.voice.latencyMs.v1';
/** Device id used when the user keeps the default microphone. */
export const DEFAULT_DEVICE_KEY = 'default';

/**
 * Time of the first sample whose magnitude exceeds `threshold` times the
 * buffer's peak (and an absolute floor), in seconds; null when nothing there.
 */
export function detectClickOnset(
  samples: Float32Array,
  sampleRate: number,
  relativeThreshold = 0.3,
  floor = 0.02,
): number | null {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < floor) return null;
  const limit = peak * relativeThreshold;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= limit) return i / sampleRate;
  }
  return null;
}

type Store = Record<string, number>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(LATENCY_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function getStoredLatencyMs(deviceId: string): number {
  const v = readStore()[deviceId || DEFAULT_DEVICE_KEY];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** True once a latency was measured for this device (a stored 0 counts). */
export function hasStoredLatency(deviceId: string): boolean {
  return typeof readStore()[deviceId || DEFAULT_DEVICE_KEY] === 'number';
}

export const SETUP_SEEN_KEY = 'devilbox.voice.setupSeen.v1';

/**
 * The setup wizard opens by itself until it was closed once or a latency is
 * stored, and once more after the v2 drum migration reset the training.
 */
export function shouldOpenVoiceSetup(): boolean {
  if (drumsResetPending()) return true;
  try {
    if (localStorage.getItem(SETUP_SEEN_KEY) === '1') return false;
  } catch {
    /* storage unavailable: fall through to the latency check */
  }
  return !hasStoredLatency('');
}

export function markVoiceSetupSeen(): void {
  clearDrumsReset();
  try {
    localStorage.setItem(SETUP_SEEN_KEY, '1');
  } catch {
    /* storage unavailable: the wizard opens again next time */
  }
}

export function storeLatencyMs(deviceId: string, ms: number): void {
  try {
    localStorage.setItem(
      LATENCY_STORAGE_KEY,
      JSON.stringify({ ...readStore(), [deviceId || DEFAULT_DEVICE_KEY]: ms }),
    );
  } catch {
    /* storage unavailable: the calibration lasts for this panel only */
  }
}

const CLICK_DELAY_SECONDS = 0.3;
const LISTEN_SECONDS = 1.0;

/**
 * Play one click through `capture` and measure its round trip in milliseconds.
 * Resolves null when the click never reached the microphone.
 */
export async function measureLoopbackLatencyMs(
  capture: VoiceCapture,
  listenSeconds = LISTEN_SECONDS,
): Promise<number | null> {
  const blocks: Float32Array[] = [];
  let total = 0;
  let done: () => void = () => {};
  const finished = new Promise<void>((r) => { done = r; });
  const wanted = Math.round(listenSeconds * capture.sampleRate);
  await capture.start((b) => {
    if (total >= wanted) return;
    blocks.push(new Float32Array(b));
    total += b.length;
    if (total >= wanted) done();
  });
  capture.click(CLICK_DELAY_SECONDS, true);
  await finished;
  capture.stop();
  const onset = detectClickOnset(concatBlocks(blocks), capture.sampleRate);
  if (onset === null) return null;
  return Math.max(0, Math.round((onset - CLICK_DELAY_SECONDS) * 1000));
}

export { PITCH_SAMPLE_RATE };
