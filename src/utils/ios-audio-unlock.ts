/**
 * iOS Silent Audio Unlock
 *
 * iOS Safari (and other iOS browsers) won't play Web Audio when the device's
 * mute/silent switch is on. Playing a silent MP3 via a native HTML <audio>
 * element on user interaction activates the audio output, allowing Web Audio
 * (Tone.js) to work even when the device is muted.
 *
 * IMPORTANT: On iOS Safari, calling AudioContext.resume() alone is NOT enough.
 * The context will report state === 'running' but won't actually produce audio
 * until real audio data flows through it during a user gesture. We must play a
 * silent buffer through the AudioContext to fully activate it.
 *
 * This must be called during a user gesture (click/touch) — the same gesture
 * that would start playback. It's idempotent: after the first successful play,
 * subsequent calls are no-ops.
 *
 * Tested on: iPhone 8 (13.4), iPhone 12-15 (17.x) via LambdaTest.
 * Reference: https://github.com/nicvett/ios-audio-unlock
 */

import * as Tone from 'tone';

let audioElement: HTMLAudioElement | null = null;
let unlocked = false;

/**
 * Create the hidden audio element (lazily on first call).
 * Uses a tiny silent.mp3 in public/ — native HTML audio bypasses
 * the mute switch restriction that blocks AudioContext.
 */
function getAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = document.createElement('audio');
    audioElement.src = '/silent.mp3';
    audioElement.preload = 'auto';
    // Keep the element in the DOM but invisible
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);
  }
  return audioElement;
}

/**
 * Play a 1-sample silent buffer through an AudioContext to force iOS
 * to fully activate the audio output pipeline. Just calling .resume()
 * is not sufficient — iOS reports 'running' but won't produce sound
 * until actual audio data flows through the context during a gesture.
 */
function pumpSilentBuffer(ctx: AudioContext): void {
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    src.onended = () => { try { src.disconnect(); } catch { /* already disconnected */ } };
  } catch {
    // Context may not be ready yet — that's OK
  }
}

/**
 * Play the silent MP3 to unlock iOS audio output.
 * Call this synchronously inside a user gesture handler (click/touchend)
 * BEFORE starting Web Audio / Tone.js playback.
 *
 * Returns a promise that resolves when the unlock play completes.
 * Safe to call multiple times — only does work once.
 */
export async function unlockIOSAudio(): Promise<void> {
  if (unlocked) return;

  // Only needed on iOS — check for iOS/iPadOS user agent
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) {
    unlocked = true;
    return;
  }

  // 1) Play silent MP3 via native HTML audio (bypasses mute switch)
  const el = getAudioElement();
  try {
    await el.play();
    console.log('[iOS Audio] Silent MP3 played — mute switch bypassed');
  } catch (err) {
    // play() can fail if called outside user gesture — that's OK,
    // it will succeed on the next user interaction
    console.warn('[iOS Audio] Silent MP3 play failed (will retry on next gesture):', err);
  }

  // 2) Pump silent buffer through Web AudioContext to fully activate it.
  //    Without this, iOS reports context.state === 'running' but produces no audio.
  try {
    const rawCtx = (Tone.getContext() as unknown as { _context?: AudioContext; rawContext?: AudioContext });
    const nativeCtx = rawCtx._context || rawCtx.rawContext || (Tone.getContext() as unknown as AudioContext);
    if (nativeCtx && typeof nativeCtx.createBuffer === 'function') {
      if (nativeCtx.state === 'suspended') {
        await nativeCtx.resume();
      }
      pumpSilentBuffer(nativeCtx);
      console.log('[iOS Audio] Silent buffer pumped through AudioContext');
    }
  } catch {
    // Non-critical — Tone.start() will also try to resume
  }

  unlocked = true;
}

/**
 * Check if iOS audio has been unlocked.
 */
export function isIOSAudioUnlocked(): boolean {
  return unlocked;
}
