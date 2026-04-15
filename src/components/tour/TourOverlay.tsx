/**
 * TourOverlay — Subtitle bar + controls + spotlight displayed during the guided tour.
 *
 * Fixed at bottom of screen. Shows narration text, progress, and
 * pause/skip/stop controls. Spotlight dims everything except the targeted element.
 * Only renders when tour is active.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTourStore } from '@/stores/useTourStore';
import { getTourEngine } from '@/engine/tour/TourEngine';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getSpotlightRect(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const pad = 6;
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

const SpotlightOverlay: React.FC<{ selector: string }> = ({ selector }) => {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    const measure = () => setRect(getSpotlightRect(selector));
    measure();
    const timer = setInterval(measure, 500);
    return () => clearInterval(timer);
  }, [selector]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        pointerEvents: 'none',
        transition: 'opacity 0.4s',
      }}
    >
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              rx={8}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.55)"
          mask="url(#tour-spotlight-mask)"
        />
        <rect
          x={rect.left}
          y={rect.top}
          width={rect.width}
          height={rect.height}
          rx={8}
          fill="none"
          stroke="rgba(96, 165, 250, 0.5)"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
};

/** Subtitle text with fade-in/fade-out on change */
const SubtitleText: React.FC<{ text: string }> = ({ text }) => {
  const [displayText, setDisplayText] = useState(text);
  const [opacity, setOpacity] = useState(1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevTextRef = useRef(text);

  useEffect(() => {
    const prevText = prevTextRef.current;
    prevTextRef.current = text;

    // Text cleared — fade out fully and clear display
    if (!text && prevText) {
      setOpacity(0);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setDisplayText(''), 300);
      return () => clearTimeout(timeoutRef.current);
    }

    // Same text or both empty — no animation needed
    if (text === displayText) return;

    // Text changed — fade out old, swap, fade in new
    if (text) {
      setOpacity(0);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setDisplayText(text);
        setOpacity(1);
      }, 300);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <p
      style={{
        color: '#fff',
        fontSize: 20,
        lineHeight: 1.5,
        fontFamily: "'JetBrains Mono', monospace",
        textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        margin: 0,
        opacity,
        transition: 'opacity 0.3s ease-in-out',
        minHeight: 30,
      }}
    >
      {displayText || '\u00A0'}
    </p>
  );
};

export const TourOverlay: React.FC = () => {
  const isActive = useTourStore((s) => s.isActive);
  const isPaused = useTourStore((s) => s.isPaused);
  const subtitle = useTourStore((s) => s.subtitle);
  const currentStep = useTourStore((s) => s.currentStep);
  const totalSteps = useTourStore((s) => s.totalSteps);
  const isPreRendering = useTourStore((s) => s.isPreRendering);
  const preRenderProgress = useTourStore((s) => s.preRenderProgress);
  const spotlightSelector = useTourStore((s) => s.spotlightSelector);

  const handlePauseResume = useCallback(() => {
    const engine = getTourEngine();
    if (isPaused) engine.resume();
    else engine.pause();
  }, [isPaused]);

  const handleSkip = useCallback(() => {
    getTourEngine().skipToNext();
  }, []);

  const handleStop = useCallback(() => {
    getTourEngine().stop();
  }, []);

  if (!isActive) return null;

  return (
    <>
      {/* Spotlight overlay (behind subtitle bar) */}
      {spotlightSelector && !isPreRendering && (
        <SpotlightOverlay selector={spotlightSelector} />
      )}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          pointerEvents: 'auto',
        }}
      >
      {/* Subtitle area */}
      <div
        style={{
          background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.85))',
          padding: '24px 32px 8px',
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          {isPreRendering ? (
            <div style={{ color: '#aaa', fontSize: 16 }}>
              <div style={{ marginBottom: 8 }}>
                Preparing tour narration... {Math.round(preRenderProgress * 100)}%
              </div>
              <div
                style={{
                  height: 3,
                  background: '#333',
                  borderRadius: 2,
                  overflow: 'hidden',
                  maxWidth: 300,
                  margin: '0 auto',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${preRenderProgress * 100}%`,
                    background: '#60a5fa',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          ) : (
            <SubtitleText text={subtitle} />
          )}
        </div>
      </div>

      {/* Control bar */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        {/* Progress */}
        <span
          style={{
            color: '#888',
            fontSize: 12,
            fontFamily: 'monospace',
            minWidth: 60,
          }}
        >
          {currentStep + 1}/{totalSteps}
        </span>

        {/* Progress bar */}
        <div
          style={{
            flex: 1,
            maxWidth: 400,
            height: 3,
            background: '#333',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: totalSteps > 0 ? `${((currentStep + 1) / totalSteps) * 100}%` : '0%',
              background: '#60a5fa',
              transition: 'width 0.5s ease-out',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <TourButton onClick={handlePauseResume} title={isPaused ? 'Resume' : 'Pause'}>
            {isPaused ? '▶' : '❚❚'}
          </TourButton>
          <TourButton onClick={handleSkip} title="Skip">
            ⏭
          </TourButton>
          <TourButton onClick={handleStop} title="Stop Tour">
            ✕
          </TourButton>
        </div>
      </div>
      </div>
    </>
  );
};

const TourButton: React.FC<{
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: 4,
      color: '#fff',
      cursor: 'pointer',
      fontSize: 14,
      padding: '4px 12px',
      transition: 'background 0.15s',
    }}
    onMouseEnter={(e) => {
      (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)';
    }}
    onMouseLeave={(e) => {
      (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)';
    }}
  >
    {children}
  </button>
);
