/**
 * Puts DEViLBOX on the operating system's media controls.
 *
 * Reported from a car on 2026-09-18: over Bluetooth, DEViLBOX was inaudible
 * unless Music.app happened to be playing at the same time, the car kept
 * launching Music on connect, and the dashboard showed nothing. All three come
 * from the same absence — Web Audio makes noise, but it does not make the page
 * a media SESSION, and the car's AVRCP messages have to land somewhere.
 *
 * See `@/lib/audio/mediaSession` for the mechanism. This hook is only the
 * wiring: transport state in, transport actions out.
 */

import { useEffect, useRef } from 'react';
import { useTransportStore } from '@/stores/useTransportStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import {
  MediaSessionController,
  mediaSessionInfo,
  supportsMediaSession,
} from '@/lib/audio/mediaSession';

export function useMediaSession(): void {
  const controller = useRef<MediaSessionController | null>(null);

  const isPlaying = useTransportStore(s => s.isPlaying);
  const isPaused = useTransportStore(s => s.isPaused);
  const name = useProjectStore(s => s.metadata.name);
  const author = useProjectStore(s => s.metadata.author);
  const sourceFormat = useTrackerStore(s => s.patterns[0]?.importMetadata?.sourceFormat);

  // One controller for the life of the app. Built lazily so a browser without
  // the API never creates the element at all.
  useEffect(() => {
    if (!supportsMediaSession()) return;
    const c = new MediaSessionController();
    controller.current = c;

    // Read the actions off the store at call time. The OS may deliver a
    // transport command at any point, including long after this ran, and a
    // captured action would be the one that existed at mount.
    c.setHandlers({
      play: () => { void useTransportStore.getState().play(); },
      pause: () => { useTransportStore.getState().pause(); },
      stop: () => { useTransportStore.getState().stop(); },
    });

    return () => {
      c.dispose();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.setPlaybackState(
      isPlaying ? 'playing' : isPaused ? 'paused' : 'none',
    );
  }, [isPlaying, isPaused]);

  useEffect(() => {
    controller.current?.setMetadata(mediaSessionInfo({ name, author }, sourceFormat));
  }, [name, author, sourceFormat]);
}
