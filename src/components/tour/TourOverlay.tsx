/**
 * TourOverlay — Subtitle bar + controls displayed during the guided tour.
 *
 * Fixed at bottom of screen. Shows narration text, progress, and
 * pause/skip/stop controls. Only renders when tour is active.
 */

import React, { useCallback } from 'react';
import { useTourStore } from '@/stores/useTourStore';
import { getTourEngine } from '@/engine/tour/TourEngine';

export const TourOverlay: React.FC = () => {
  const isActive = useTourStore((s) => s.isActive);
  const isPaused = useTourStore((s) => s.isPaused);
  const subtitle = useTourStore((s) => s.subtitle);
  const currentStep = useTourStore((s) => s.currentStep);
  const totalSteps = useTourStore((s) => s.totalSteps);
  const isSpeaking = useTourStore((s) => s.isSpeaking);
  const isPreRendering = useTourStore((s) => s.isPreRendering);
  const preRenderProgress = useTourStore((s) => s.preRenderProgress);

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
            <p
              style={{
                color: '#fff',
                fontSize: 20,
                lineHeight: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                margin: 0,
                opacity: isSpeaking ? 1 : 0.6,
                transition: 'opacity 0.3s',
              }}
            >
              {subtitle || '\u00A0'}
            </p>
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
