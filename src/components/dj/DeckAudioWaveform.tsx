/**
 * DeckAudioWaveform - Scrolling waveform display for audio files
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Falls back to null when no waveform data exists (unchanged behaviour).
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import WaveformWorkerFactory from '@/workers/dj-waveform.worker.ts?worker';
import type { WaveformMsg } from '@engine/renderer/worker-types';

interface DeckAudioWaveformProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckAudioWaveform: React.FC<DeckAudioWaveformProps> = ({ deckId }) => {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef    = useRef<OffscreenBridge<WaveformMsg, { type: string }> | null>(null);

  // ── Bridge init ────────────────────────────────────────────────────────────
  // Canvas created imperatively — prevents StrictMode double-transferControlToOffscreen error.

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr  = Math.min(window.devicePixelRatio, 2);
    const w    = Math.max(1, container.clientWidth);
    const h    = Math.max(1, container.clientHeight);
    const deck = useDJStore.getState().decks[deckId];
    const offscreen = canvas.transferControlToOffscreen();

    const bridge = new OffscreenBridge<WaveformMsg, { type: string }>(
      WaveformWorkerFactory, { onReady: () => {} },
    );
    bridgeRef.current = bridge;

    bridge.post({
      type: 'init',
      canvas: offscreen,
      dpr, width: w, height: h,
      waveformPeaks:  deck.waveformPeaks ? Array.from(deck.waveformPeaks) : null,
      durationMs:     deck.durationMs,
      audioPosition:  deck.audioPosition,
      cuePoints:      deck.seratoCuePoints,
    }, [offscreen]);

    // Position (high-frequency, 30fps from DJDeck poller)
    const unsubPos = useDJStore.subscribe(
      (s) => s.decks[deckId].audioPosition,
      (audioPosition) => bridgeRef.current?.post({ type: 'position', audioPosition }),
    );

    // Waveform peaks (on track load)
    const unsubPeaks = useDJStore.subscribe(
      (s) => s.decks[deckId].waveformPeaks,
      (peaks) => bridgeRef.current?.post({
        type: 'waveformPeaks',
        peaks: peaks ? Array.from(peaks) : null,
        durationMs: useDJStore.getState().decks[deckId].durationMs,
      }),
    );

    // Cue points (on track load)
    const unsubCues = useDJStore.subscribe(
      (s) => s.decks[deckId].seratoCuePoints,
      (cuePoints) => bridgeRef.current?.post({ type: 'cuePoints', cuePoints }),
    );

    // Resize observer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        bridgeRef.current?.post({ type: 'resize', w, h, dpr: Math.min(window.devicePixelRatio, 2) });
      }
    });
    observer.observe(container);

    return () => {
      unsubPos();
      unsubPeaks();
      unsubCues();
      observer.disconnect();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const waveformPeaks = useDJStore((s) => s.decks[deckId].waveformPeaks);

  // Click-to-seek: waveform shows a 10s window centered on playhead
  const WINDOW_SEC = 10;
  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const state = useDJStore.getState().decks[deckId];
    const seekSec = Math.max(0, Math.min(
      state.audioPosition - WINDOW_SEC / 2 + frac * WINDOW_SEC,
      (state.durationMs / 1000) - 0.01
    ));
    try {
      const deck = getDJEngine().getDeck(deckId);
      deck.audioPlayer.seek(seekSec);
      useDJStore.getState().setDeckState(deckId, { audioPosition: seekSec, elapsedMs: seekSec * 1000 });
    } catch { /* engine not ready */ }
  }, [deckId]);

  if (!waveformPeaks || waveformPeaks.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="w-full h-16 shrink-0 bg-dark-bg border border-dark-border rounded-sm overflow-hidden cursor-pointer"
      onClick={handleClick}
    />
  );
};
