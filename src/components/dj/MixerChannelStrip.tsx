/**
 * MixerChannelStrip - Vertical volume fader + VU meter for one DJ deck
 *
 * Features a vertical CSS slider with a silver handle and a 12-segment
 * LED-style VU meter that updates on animation frame.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerChannelStripProps {
  deckId: 'A' | 'B';
}

/** Convert linear volume (0-1) to dB display string */
function volumeToDb(volume: number): string {
  if (volume <= 0) return '-\u221E';
  const dB = 20 * Math.log10(volume);
  if (dB >= -0.5) return '0dB';
  if (dB < -60) return '-\u221EdB';
  return `${dB.toFixed(0)}dB`;
}

/** Map a dB level to 0-12 segment count for the VU meter */
function levelToSegments(dBLevel: number): number {
  // dBLevel typically -Infinity to ~0 dB
  // Map: -60dB = 0 segments, 0dB = 12 segments
  if (dBLevel <= -60) return 0;
  if (dBLevel >= 0) return 12;
  const normalized = (dBLevel + 60) / 60;
  return Math.round(normalized * 12);
}

/** Get LED color for a given segment index (0=bottom, 11=top) */
function getSegmentColor(index: number, lit: boolean): string {
  if (!lit) return '#1a1a1a';
  if (index >= 10) return '#ef4444'; // Red (top 2)
  if (index >= 7) return '#eab308';  // Yellow (mid 3)
  return '#22c55e';                   // Green (bottom 7)
}

const VU_SEGMENTS = 12;

export const MixerChannelStrip: React.FC<MixerChannelStripProps> = ({ deckId }) => {
  const volume = useDJStore((s) => s.decks[deckId].volume);
  const [level, setLevel] = useState(-Infinity);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    useDJStore.getState().setDeckVolume(deckId, value);
    getDJEngine().getDeck(deckId).setVolume(value);
  }, [deckId]);

  // Animate VU meter via requestAnimationFrame
  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      try {
        const dB = getDJEngine().getDeck(deckId).getLevel();
        setLevel(typeof dB === 'number' ? dB : -Infinity);
      } catch {
        // Engine not ready yet
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [deckId]);

  const segments = levelToSegments(level);

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Deck label */}
      <div className="text-text-muted text-[10px] font-mono tracking-wider">
        {deckId}
      </div>

      <div className="flex items-stretch gap-1.5" style={{ height: 100 }}>
        {/* Vertical fader */}
        <div className="relative flex items-center" style={{ width: 28 }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
            className="mixer-fader-vertical"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              width: 100,
              height: 28,
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* VU meter */}
        <div
          className="flex flex-col-reverse gap-[1px] justify-center"
          style={{ width: 8 }}
        >
          {Array.from({ length: VU_SEGMENTS }, (_, i) => (
            <div
              key={i}
              className="rounded-[1px]"
              style={{
                width: 8,
                height: 6,
                backgroundColor: getSegmentColor(i, i < segments),
                boxShadow: i < segments ? `0 0 4px ${getSegmentColor(i, true)}80` : 'none',
                transition: 'background-color 0.05s',
              }}
            />
          ))}
        </div>
      </div>

      {/* dB readout */}
      <div className="text-text-muted text-[9px] font-mono">
        {volumeToDb(volume)}
      </div>

      {/* Fader styles */}
      <style>{`
        .mixer-fader-vertical::-webkit-slider-runnable-track {
          width: 4px;
          height: 100%;
          background: #2a2a2a;
          border-radius: 2px;
          border: 1px solid #333;
        }
        .mixer-fader-vertical::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px;
          height: 10px;
          background: linear-gradient(to bottom, #ccc, #999);
          border: 1px solid #666;
          border-radius: 2px;
          cursor: grab;
          margin-left: -10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        .mixer-fader-vertical::-webkit-slider-thumb:active {
          cursor: grabbing;
          background: linear-gradient(to bottom, #ddd, #aaa);
        }
        .mixer-fader-vertical::-moz-range-track {
          width: 4px;
          background: #2a2a2a;
          border-radius: 2px;
          border: 1px solid #333;
        }
        .mixer-fader-vertical::-moz-range-thumb {
          width: 24px;
          height: 10px;
          background: linear-gradient(to bottom, #ccc, #999);
          border: 1px solid #666;
          border-radius: 2px;
          cursor: grab;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
};
