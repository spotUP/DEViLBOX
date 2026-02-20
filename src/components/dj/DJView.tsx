/**
 * DJView - Main DJ mixing interface
 *
 * Layout: Deck A (left) | Mixer (center) | Deck B (right)
 * Inspired by Pioneer DJM-900 hardware mixer aesthetic.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine, disposeDJEngine } from '@/engine/dj/DJEngine';
import type { DJEngine } from '@/engine/dj/DJEngine';
import { useUIStore } from '@/stores/useUIStore';
import { DJDeck } from './DJDeck';
import { DJMixer } from './DJMixer';
import { DJFileBrowser } from './DJFileBrowser';
import { useDJKeyboardHandler } from './DJKeyboardHandler';

// ============================================================================
// MAIN DJ VIEW
// ============================================================================

export const DJView: React.FC = () => {
  const engineRef = useRef<DJEngine | null>(null);
  const setDJModeActive = useDJStore((s) => s.setDJModeActive);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const [showFileBrowser, setShowFileBrowser] = useState(false);

  // Initialize DJEngine on mount, dispose on unmount
  useEffect(() => {
    engineRef.current = getDJEngine();
    setDJModeActive(true);

    return () => {
      setDJModeActive(false);
      disposeDJEngine();
      engineRef.current = null;
    };
  }, [setDJModeActive]);

  // DJ keyboard shortcuts
  useDJKeyboardHandler(true);

  const handleClose = useCallback(() => {
    setActiveView('tracker');
  }, [setActiveView]);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden select-none"
      style={{
        backgroundColor: '#0a0a0f',
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', monospace",
      }}
    >
      {/* ================================================================== */}
      {/* TOP BAR                                                            */}
      {/* ================================================================== */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          backgroundColor: '#08080d',
          borderBottom: '1px solid #1a1a2e',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-sm font-bold tracking-widest uppercase"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent) 0%, #a855f7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            DEViLBOX DJ
          </span>
          <div className="h-4 w-px bg-dark-border" />
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
            Dual Deck Mixer
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFileBrowser(!showFileBrowser)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-all
              ${showFileBrowser
                ? 'border-accent-primary bg-dark-bgActive text-text-primary'
                : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
              }`}
          >
            Browser
          </button>

          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono
              border border-dark-borderLight bg-dark-bgTertiary
              hover:bg-accent-error/20 hover:border-accent-error hover:text-accent-error
              text-text-secondary transition-all"
            title="Return to tracker"
          >
            <X size={14} />
            Close
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* FILE BROWSER (collapsible)                                         */}
      {/* ================================================================== */}
      {showFileBrowser && (
        <div className="shrink-0 px-2 pt-2">
          <DJFileBrowser onClose={() => setShowFileBrowser(false)} />
        </div>
      )}

      {/* ================================================================== */}
      {/* MAIN 3-COLUMN LAYOUT: Deck A | Mixer | Deck B                     */}
      {/* ================================================================== */}
      <div className="flex-1 grid grid-cols-[1fr_280px_1fr] gap-2 p-2 overflow-hidden min-h-0">
        {/* ---- Deck A (left) ---- */}
        <div className="overflow-y-auto min-h-0">
          <DJDeck deckId="A" />
        </div>

        {/* ---- Center Mixer ---- */}
        <div className="overflow-y-auto min-h-0">
          <DJMixer />
        </div>

        {/* ---- Deck B (right) ---- */}
        <div className="overflow-y-auto min-h-0">
          <DJDeck deckId="B" />
        </div>
      </div>
    </div>
  );
};
