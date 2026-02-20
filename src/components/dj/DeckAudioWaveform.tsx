/**
 * DeckAudioWaveform - Scrolling waveform display for audio files
 *
 * Canvas rendering runs on a background thread via OffscreenCanvas.
 * Falls back to null when no waveform data exists (unchanged behaviour).
 */

import React, { useRef, useEffect } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { OffscreenBridge } from '@engine/renderer/OffscreenBridge';
import WaveformWorkerFactory from '@/workers/dj-waveform.worker.ts?worker';
import type { WaveformMsg } from '@engine/renderer/worker-types';

interface DeckAudioWaveformProps {
  deckId: 'A' | 'B';
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
  if (!waveformPeaks || waveformPeaks.length === 0) return null;

  return (
    <div ref={containerRef} className="w-full h-full bg-dark-bg border border-dark-border rounded-sm overflow-hidden" />
  );
};
