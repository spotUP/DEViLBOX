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
 * STRATEGY: Install a global one-time touchend/click listener on the document.
 * The very first user interaction — even dismissing a modal — will unlock audio.
 * This is called from main.tsx at startup so it's ready before any UI renders.
 *
 * Tested on: iPhone 8 (13.4), iPhone 12-15 (17.x) via LambdaTest.
 * Reference: https://github.com/nicvett/ios-audio-unlock
 */

import * as Tone from 'tone';

let audioElement: HTMLAudioElement | null = null;
let unlocked = false;
let globalListenerInstalled = false;

/**
 * Detect iOS/iPadOS.
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Create the hidden audio element (lazily on first call).
 * Uses a tiny silent.mp3 in public/ — native HTML audio bypasses
 * the mute switch restriction that blocks AudioContext.
 *
 * IMPORTANT: preload='none' to avoid iOS permission errors before user gesture.
 */
function getAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = document.createElement('audio');
    audioElement.src = '/silent.mp3';
    audioElement.preload = 'none'; // Don't load until user gesture — avoids iOS permission error
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
 * Perform the actual unlock. Called synchronously within a user gesture.
 * Uses fire-and-forget for the MP3 play — awaiting would break the
 * iOS gesture chain and cause the unlock to fail.
 */
function doUnlock(): void {
  if (unlocked) return;
  unlocked = true;

  console.log('[iOS Audio] First user gesture detected — unlocking audio');

  // 1) Play silent MP3 via native HTML audio (bypasses mute switch).
  //    Fire-and-forget — el.play() returns a promise but we must not await
  //    because the gesture context must stay synchronous.
  const el = getAudioElement();
  el.play().then(() => {
    console.log('[iOS Audio] Silent MP3 played — mute switch bypassed');
  }).catch((err) => {
    // Not fatal — the AudioContext pump below is usually sufficient
    console.warn('[iOS Audio] Silent MP3 play failed:', err);
  });

  // 2) Resume AudioContext + pump silent buffer synchronously in the gesture.
  try {
    const rawCtx = (Tone.getContext() as unknown as { _context?: AudioContext; rawContext?: AudioContext });
    const nativeCtx = rawCtx._context || rawCtx.rawContext || (Tone.getContext() as unknown as AudioContext);
    if (nativeCtx && typeof nativeCtx.createBuffer === 'function') {
      if (nativeCtx.state === 'suspended') {
        nativeCtx.resume(); // Fire-and-forget — must not block gesture
      }
      pumpSilentBuffer(nativeCtx);
      console.log('[iOS Audio] Silent buffer pumped through AudioContext');
    }
  } catch {
    // Non-critical — Tone.start() will also try to resume
  }

  // 3) Also trigger Tone.start() (fire-and-forget)
  Tone.start().catch(() => { /* will retry on actual playback */ });

  // Remove the global listeners — we only need to unlock once
  document.removeEventListener('touchend', doUnlock, true);
  document.removeEventListener('click', doUnlock, true);
}

/**
 * Install a global one-time touch/click listener to unlock iOS audio
 * on the very first user interaction — even dismissing a modal.
 *
 * Call this once at app startup (from main.tsx). On non-iOS platforms
 * it's a no-op.
 */
export function installIOSAudioUnlock(): void {
  if (globalListenerInstalled) return;
  globalListenerInstalled = true;

  if (!isIOS()) {
    unlocked = true;
    return;
  }

  console.log('[iOS Audio] Installing global unlock listener');

  // Use capture phase so we get the event before any stopPropagation
  document.addEventListener('touchend', doUnlock, true);
  document.addEventListener('click', doUnlock, true);
}

/**
 * Play the silent MP3 to unlock iOS audio output.
 * This is still exported for use in specific gesture handlers (transport, etc.)
 * but with the global listener installed, it's usually a no-op.
 *
 * Safe to call multiple times — only does work once.
 */
export async function unlockIOSAudio(): Promise<void> {
  if (unlocked) return;
  doUnlock();
}

/**
 * Check if iOS audio has been unlocked.
 */
export function isIOSAudioUnlocked(): boolean {
  return unlocked;
}
