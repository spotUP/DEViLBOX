/**
 * iOS Silent Audio Unlock
 *
 * iOS Safari (and other iOS browsers) won't play Web Audio when the device's
 * mute/silent switch is on. Playing a silent MP3 via a native HTML <audio>
 * element on user interaction activates the audio output, allowing Web Audio
 * (Tone.js) to work even when the device is muted.
 *
 * This must be called during a user gesture (click/touch) — the same gesture
 * that would start playback. It's idempotent: after the first successful play,
 * subsequent calls are no-ops.
 *
 * Tested on: iPhone 8 (13.4), iPhone 12-15 (17.x) via LambdaTest.
 * Reference: https://github.com/nicvett/ios-audio-unlock
 */

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

  const el = getAudioElement();
  try {
    await el.play();
    unlocked = true;
    console.log('[iOS Audio] Silent MP3 played — audio output unlocked');
  } catch (err) {
    // play() can fail if called outside user gesture — that's OK,
    // it will succeed on the next user interaction
    console.warn('[iOS Audio] Silent MP3 play failed (will retry on next gesture):', err);
  }
}

/**
 * Check if iOS audio has been unlocked.
 */
export function isIOSAudioUnlocked(): boolean {
  return unlocked;
}
