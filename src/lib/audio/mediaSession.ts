/**
 * Media Session — telling the operating system that DEViLBOX is playing music.
 *
 * DEViLBOX renders through Web Audio, which the OS treats as "a page making
 * noise" rather than as a media player. Three consequences, all reported from
 * a car on 2026-09-18:
 *
 *  1. **Bluetooth car kits stayed silent.** Many head units keep the A2DP
 *     stream gated until AVRCP reports a PLAYING state, and that state comes
 *     from a media session. Audio only became audible when Music.app was
 *     playing at the same time — Music set the flag, the car opened the
 *     stream, and DEViLBOX rode along on it.
 *  2. **The car kept starting Music.** Its AVRCP `PLAY` on connect goes to
 *     whatever macOS considers the media app. With no session of our own, that
 *     is always something else.
 *  3. **Nothing on the dashboard.** No title, no transport buttons.
 *
 * A media session fixes all three, and it needs a real media ELEMENT: the
 * `MediaSession` API only takes effect while an `<audio>`/`<video>` element is
 * playing. So this holds a silent looping one. It emits nothing audible — the
 * music still comes from Web Audio — it exists solely so the OS has a media
 * stream to attach the session to.
 *
 * Everything degrades quietly: a browser with no `mediaSession`, a blocked
 * autoplay, a failed element — each leaves the app exactly as it was.
 */

/** Seconds of silence in the looping element. */
const SILENCE_SECONDS = 1;
/** 8 kHz 8-bit mono. Nothing here is heard; only its existence matters. */
const SILENCE_RATE = 8000;

/**
 * Build the silent clip in memory.
 *
 * Built rather than fetched because a media session that depends on the
 * network fails in exactly the situation it is needed for: a car, on a phone,
 * with no signal. Built rather than inlined as base64 because a clip long
 * enough to loop calmly is tens of kilobytes of string in a source file, and a
 * clip short enough to inline (the 1-SAMPLE literal this replaces) restarts
 * thousands of times a second.
 */
function silentWavUrl(): string {
  const frames = SILENCE_RATE * SILENCE_SECONDS;
  const header = 44;
  const buf = new ArrayBuffer(header + frames);
  const view = new DataView(buf);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);          // PCM header length
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, SILENCE_RATE, true);
  view.setUint32(28, SILENCE_RATE, true); // byte rate = rate x 1 byte
  view.setUint16(32, 1, true);           // block align
  view.setUint16(34, 8, true);           // bits per sample
  ascii(36, 'data');
  view.setUint32(40, frames, true);
  // 8-bit PCM is UNSIGNED: silence is 0x80, and a buffer of zeroes would be
  // full-scale negative DC instead.
  new Uint8Array(buf, header).fill(0x80);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  stop: () => void;
  previousTrack?: () => void;
  nextTrack?: () => void;
}

export interface MediaSessionInfo {
  title: string;
  artist: string;
  album: string;
}

/**
 * Song details for the dashboard.
 *
 * A module with no name still gets a title: "DEViLBOX" on the dash is better
 * than a blank line, and blank is what an untitled tracker module would give.
 */
export function mediaSessionInfo(
  metadata: { name?: string; author?: string } | null | undefined,
  formatLabel?: string | null,
): MediaSessionInfo {
  const name = metadata?.name?.trim();
  const author = metadata?.author?.trim();
  return {
    title: name && name.length > 0 ? name : 'DEViLBOX',
    artist: author && author.length > 0 ? author : 'DEViLBOX',
    album: formatLabel?.trim() || 'Tracker',
  };
}

/** True when this browser can host a media session at all. */
export function supportsMediaSession(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

/**
 * Owns the silent element and the session.
 *
 * A class rather than loose functions because the element has a lifetime: one
 * per app, created on the first play (autoplay rules need the user's gesture,
 * and pressing play IS that gesture).
 */
export class MediaSessionController {
  private element: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private handlers: MediaSessionHandlers | null = null;
  private handlersBound = false;

  setHandlers(handlers: MediaSessionHandlers): void {
    this.handlers = handlers;
    this.bindActions();
  }

  /** Reflect the transport. Playing starts the silent element; stopped ends it. */
  setPlaybackState(state: 'playing' | 'paused' | 'none'): void {
    if (state === 'playing') void this.startElement();
    else this.stopElement(state === 'none');

    if (!supportsMediaSession()) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch { /* browsers differ on when this is writable */ }
  }

  setMetadata(info: MediaSessionInfo): void {
    if (!supportsMediaSession()) return;
    const MediaMetadataCtor = (globalThis as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata;
    if (!MediaMetadataCtor) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadataCtor({
        title: info.title,
        artist: info.artist,
        album: info.album,
      });
    } catch { /* metadata is a nicety; never break playback for it */ }
  }

  /** Release everything — app teardown, or a test. */
  dispose(): void {
    this.stopElement(true);
    this.element?.remove();
    this.element = null;
    if (this.objectUrl) {
      try { URL.revokeObjectURL(this.objectUrl); } catch { /* ok */ }
      this.objectUrl = null;
    }
    this.handlers = null;
    this.handlersBound = false;
  }

  private async startElement(): Promise<void> {
    if (typeof document === 'undefined') return;
    if (!this.element) {
      const el = document.createElement('audio');
      this.objectUrl = silentWavUrl();
      el.src = this.objectUrl;
      el.loop = true;
      // Silent by construction AND by volume: the music comes from Web Audio,
      // and this element must never add anything to it.
      el.volume = 0;
      el.setAttribute('aria-hidden', 'true');
      this.element = el;
    }
    try {
      await this.element.play();
    } catch {
      // Autoplay refused — the session simply does not come up. The app plays
      // as it always did; only the dashboard integration is missing.
    }
  }

  private stopElement(clearPosition: boolean): void {
    if (!this.element) return;
    try {
      this.element.pause();
      if (clearPosition) this.element.currentTime = 0;
    } catch { /* ok */ }
  }

  private bindActions(): void {
    if (this.handlersBound || !supportsMediaSession() || !this.handlers) return;
    const handlers = this.handlers;
    const set = (action: MediaSessionAction, fn: (() => void) | undefined) => {
      if (!fn) return;
      try {
        navigator.mediaSession.setActionHandler(action, () => fn());
      } catch {
        // Unsupported action on this browser — skip it rather than failing the
        // whole binding, or one missing action would cost all of them.
      }
    };
    set('play', handlers.play);
    set('pause', handlers.pause);
    set('stop', handlers.stop);
    set('previoustrack', handlers.previousTrack);
    set('nexttrack', handlers.nextTrack);
    this.handlersBound = true;
  }
}
