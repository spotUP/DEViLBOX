/**
 * MixerMaster - Master volume knob + stereo VU meter
 *
 * Single knob controlling the master output volume (0 to 1.5),
 * with a dual L/R LED-style VU meter and a limiter indicator.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

const VU_SEGMENTS = 12;

/** Map a dB level to 0-12 segment count */
function levelToSegments(dBLevel: number): number {
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

export const MixerMaster: React.FC = () => {
  const masterVolume = useDJStore((s) => s.masterVolume);
  const [levelL, setLevelL] = useState(-Infinity);
  const [levelR, setLevelR] = useState(-Infinity);
  const [limiterActive, setLimiterActive] = useState(false);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const handleVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setMasterVolume(value);
    getDJEngine().mixer.setMasterVolume(value);
  }, []);

  // Animate stereo VU meter via requestAnimationFrame
  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      if (!mountedRef.current) return;
      try {
        const raw = getDJEngine().mixer.getMasterLevel();
        if (Array.isArray(raw) && raw.length >= 2) {
          setLevelL(raw[0]);
          setLevelR(raw[1]);
          // Limiter compressing when either channel exceeds -1 dB
          setLimiterActive(raw[0] > -1 || raw[1] > -1);
        } else {
          const mono = typeof raw === 'number' ? raw : -Infinity;
          setLevelL(mono);
          setLevelR(mono);
          setLimiterActive(mono > -1);
        }
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
  }, []);

  const segmentsL = levelToSegments(levelL);
  const segmentsR = levelToSegments(levelR);

  const formatMaster = useCallback((val: number) => {
    if (val <= 0) return '-\u221E';
    const dB = 20 * Math.log10(val);
    return `${dB >= -0.5 ? '0' : dB.toFixed(0)}`;
  }, []);

  return (
    <div className="flex flex-col items-center gap-1">
      <Knob
        value={masterVolume}
        min={0}
        max={1.5}
        onChange={handleVolumeChange}
        label="MST"
        size="sm"
        color="#ffffff"
        defaultValue={1}
        formatValue={formatMaster}
      />

      {/* Stereo VU meter (compact) */}
      <div className="flex gap-[2px]">
        {/* L channel */}
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[7px] font-mono leading-none mb-0.5">L</span>
          <div className="flex flex-col-reverse gap-[1px]">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="rounded-[1px]"
                style={{
                  width: 5,
                  height: 4,
                  backgroundColor: getSegmentColor(Math.round(i * 12 / 8), i < Math.round(segmentsL * 8 / 12)),
                  boxShadow: i < Math.round(segmentsL * 8 / 12) ? `0 0 3px ${getSegmentColor(Math.round(i * 12 / 8), true)}80` : 'none',
                  transition: 'background-color 0.05s',
                }}
              />
            ))}
          </div>
        </div>

        {/* R channel */}
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[7px] font-mono leading-none mb-0.5">R</span>
          <div className="flex flex-col-reverse gap-[1px]">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="rounded-[1px]"
                style={{
                  width: 5,
                  height: 4,
                  backgroundColor: getSegmentColor(Math.round(i * 12 / 8), i < Math.round(segmentsR * 8 / 12)),
                  boxShadow: i < Math.round(segmentsR * 8 / 12) ? `0 0 3px ${getSegmentColor(Math.round(i * 12 / 8), true)}80` : 'none',
                  transition: 'background-color 0.05s',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Limiter indicator */}
      <div className="flex items-center gap-0.5">
        <div
          className="rounded-full"
          style={{
            width: 5,
            height: 5,
            backgroundColor: limiterActive ? '#ef4444' : '#333',
            boxShadow: limiterActive ? '0 0 6px rgba(239,68,68,0.7)' : 'none',
            transition: 'background-color 0.1s',
          }}
        />
        <span className="text-text-muted text-[8px] font-mono">LIM</span>
      </div>
    </div>
  );
};
