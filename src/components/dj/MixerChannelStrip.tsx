/**
 * MixerChannelStrip - Vertical volume fader for one DJ deck
 *
 * Custom div-based fader (avoids browser inconsistencies with vertical
 * range inputs). VU meters are in the separate MixerVUMeter component.
 *
 * During scratch patterns, a fader gain overlay shows the current cut state:
 * - Fader open (gain=1): normal appearance
 * - Fader closed (gain=0): track groove lights up with deck color + "CUT" label
 */

import React, { useCallback, useRef, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerChannelStripProps {
  deckId: 'A' | 'B';
}

const TRACK_HEIGHT = 100;
const THUMB_HEIGHT = 12;
const THUMB_WIDTH = 24;

/** Convert linear volume (0-1) to dB display string */
function volumeToDb(volume: number): string {
  if (volume <= 0) return '-\u221E';
  const dB = 20 * Math.log10(volume);
  if (dB >= -0.5) return '0dB';
  if (dB < -60) return '-\u221EdB';
  return `${dB.toFixed(0)}dB`;
}

export const MixerChannelStrip: React.FC<MixerChannelStripProps> = ({ deckId }) => {
  const volume = useDJStore((s) => s.decks[deckId].volume);
  const scratchFaderGain = useDJStore((s) => s.decks[deckId].scratchFaderGain);
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    useDJStore.getState().setDeckVolume(deckId, clamped);
    try {
      getDJEngine().getDeck(deckId).setVolume(clamped);
    } catch {
      // Engine might not be initialized yet
    }
  }, [deckId]);

  const getVolumeFromY = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return volume;
    const rect = track.getBoundingClientRect();
    const y = clientY - rect.top;
    // Top = 1 (max volume), bottom = 0 (min volume)
    return 1 - Math.max(0, Math.min(1, y / rect.height));
  }, [volume]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setVolume(getVolumeFromY(e.clientY));
  }, [getVolumeFromY, setVolume]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setVolume(getVolumeFromY(e.clientY));
  }, [dragging, getVolumeFromY, setVolume]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const deckNum = deckId === 'A' ? '1' : '2';
  const isB = deckId === 'B';

  // Thumb Y position: top of track = volume 1, bottom = volume 0
  const usableHeight = TRACK_HEIGHT - THUMB_HEIGHT;
  const thumbTop = (1 - volume) * usableHeight;

  // Scratch fader state: show cut indicator when fader is closed during scratch
  const isFaderActive = activePatternName !== null || faderLFOActive;
  const isCut = isFaderActive && scratchFaderGain < 0.5;
  const cutColor = isB ? 'rgba(248, 113, 113, 0.6)' : 'rgba(96, 165, 250, 0.6)';

  return (
    <div className="flex flex-col items-center gap-1" title={`Deck ${deckNum} channel fader`}>
      {/* Deck label */}
      <div className="text-text-muted text-[10px] font-mono tracking-wider">
        {deckNum}
      </div>

      {/* Fader track */}
      <div
        ref={trackRef}
        className="relative cursor-pointer select-none"
        style={{ width: THUMB_WIDTH + 4, height: TRACK_HEIGHT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track groove */}
        <div
          className={`absolute rounded-full ${
            isCut
              ? 'border'
              : 'bg-dark-bgTertiary border border-dark-border'
          }`}
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            width: 6,
            top: 0,
            bottom: 0,
            ...(isCut ? { backgroundColor: cutColor, borderColor: cutColor } : {}),
          }}
        />

        {/* Filled portion — shows fader gain level during scratch */}
        {isFaderActive && (
          <div
            className="absolute rounded-full"
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              width: 6,
              bottom: 0,
              height: `${scratchFaderGain * 100}%`,
              backgroundColor: isB ? 'rgba(248, 113, 113, 0.4)' : 'rgba(96, 165, 250, 0.4)',
              transition: 'height 20ms linear',
            }}
          />
        )}

        {/* Thumb */}
        <div
          className={`absolute rounded-sm border ${
            dragging
              ? 'bg-text-muted border-text-secondary'
              : isCut
                ? 'border-dark-border'
                : 'bg-dark-borderLight border-dark-border hover:bg-text-muted'
          }`}
          style={{
            width: THUMB_WIDTH,
            height: THUMB_HEIGHT,
            left: '50%',
            transform: 'translateX(-50%)',
            top: thumbTop,
            transition: dragging ? 'none' : 'top 0.05s ease-out',
            backgroundColor: isCut ? cutColor : undefined,
          }}
        />

        {/* CUT label overlay */}
        {isCut && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span
              className="text-[8px] font-mono font-bold tracking-wider"
              style={{ color: isB ? '#f87171' : '#60a5fa' }}
            >
              CUT
            </span>
          </div>
        )}
      </div>

      {/* dB readout */}
      <div className="text-text-muted text-[9px] font-mono">
        {volumeToDb(volume)}
      </div>
    </div>
  );
};
