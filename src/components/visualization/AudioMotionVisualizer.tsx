/**
 * AudioMotionVisualizer — React wrapper around audioMotion-analyzer.
 *
 * Connects to the DEViLBOX audio chain (master bus or individual DJ deck)
 * and renders spectrum analysis using one of the curated presets.
 */

import React, { useRef, useEffect } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import { getDevilboxAudioContext, getNativeAudioNode } from '@/utils/audio-context';
import { getToneEngine } from '@/engine/ToneEngine';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { AUDIOMOTION_PRESETS } from './audioMotionPresets';

export interface AudioMotionVisualizerProps {
  /** Key into AUDIOMOTION_PRESETS */
  preset: string;
  /** Which audio source to tap */
  audioSource: 'master' | 'deckA' | 'deckB';
  /** Fixed pixel height (used in toolbar mode) */
  height?: number;
}

export const AudioMotionVisualizer: React.FC<AudioMotionVisualizerProps> = ({
  preset,
  audioSource,
  height,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);

  // Create and connect the analyzer on mount, destroy on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let audioCtx: AudioContext;
    try {
      audioCtx = getDevilboxAudioContext();
    } catch {
      // AudioContext not ready yet — bail out
      return;
    }

    // Determine low-res mode for small containers (toolbar)
    const loRes = height !== undefined && height <= 100;

    const presetOptions = AUDIOMOTION_PRESETS[preset] ?? AUDIOMOTION_PRESETS.ledBars;

    const analyzer = new AudioMotionAnalyzer(container, {
      audioCtx,
      connectSpeakers: false,
      overlay: true,
      ...presetOptions,
      loRes,
    });

    analyzerRef.current = analyzer;

    // Connect audio source
    let connectedMaster = false;
    try {
      if (audioSource === 'master') {
        const engine = getToneEngine();
        engine.enableAnalysers(); // ensure analyser tap is alive
        const nativeNode = getNativeAudioNode(engine.masterChannel);
        if (nativeNode) {
          analyzer.connectInput(nativeNode);
          connectedMaster = true;
        }
      } else {
        // deckA or deckB
        const deckId = audioSource === 'deckA' ? 'A' : 'B';
        const deck = getDJEngine().getDeck(deckId);
        const nativeNode = getNativeAudioNode(deck.getChannelGain());
        if (nativeNode) {
          analyzer.connectInput(nativeNode);
        }
      }
    } catch (err) {
      console.warn('[AudioMotionVisualizer] Failed to connect audio source:', err);
    }

    return () => {
      try {
        analyzer.destroy();
      } catch { /* ignore */ }
      analyzerRef.current = null;

      // Disconnect master analysers if we enabled them
      if (connectedMaster) {
        try {
          getToneEngine().disableAnalysers();
        } catch { /* ignore */ }
      }
    };
  }, [audioSource]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: only re-create when audioSource changes — preset changes are handled below

  // Apply preset changes without recreating the analyzer
  useEffect(() => {
    const analyzer = analyzerRef.current;
    if (!analyzer || analyzer.isDestroyed) return;

    const presetOptions = AUDIOMOTION_PRESETS[preset] ?? AUDIOMOTION_PRESETS.ledBars;
    analyzer.setOptions(presetOptions);
  }, [preset]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: height !== undefined ? height : '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    />
  );
};
