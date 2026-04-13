/**
 * ExposeOverlay — macOS Mission Control style view switcher (DOM version).
 *
 * Triggered by EXPOSÉ button or keyboard shortcut.
 * Shows all available views as cards in a grid.
 */

import React, { useEffect, useCallback } from 'react';
import { useUIStore } from '@stores/useUIStore';

const EXPOSE_VIEWS = [
  { id: 'tracker',     label: 'Tracker',  icon: '♫', color: '#60a5fa' },
  { id: 'mixer',       label: 'Mixer',    icon: '☰', color: '#a78bfa' },
  { id: 'dj',          label: 'DJ',       icon: '◎', color: '#fb923c' },
  { id: 'vj',          label: 'VJ',       icon: '◈', color: '#f472b6' },
  { id: 'studio',      label: 'Studio',   icon: '⊞', color: '#fbbf24' },
  { id: 'split',       label: 'Split',    icon: '⊟', color: '#94a3b8' },
] as const;

export const ExposeOverlay: React.FC = () => {
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);
  const selectedIdx = useUIStore((s) => s.viewExposeSelectedIdx);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const handleSelectView = useCallback((viewId: string) => {
    setActiveView(viewId as any);
    useUIStore.getState().setViewExposeActive(false);
  }, [setActiveView]);

  // Keyboard navigation
  useEffect(() => {
    if (!viewExposeActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const store = useUIStore.getState();
      const idx = store.viewExposeSelectedIdx;
      const cols = 4;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          store.setViewExposeActive(false);
          break;
        case 'Enter':
          e.preventDefault();
          const view = EXPOSE_VIEWS[idx];
          if (view) handleSelectView(view.id);
          break;
        case 'Tab':
          e.preventDefault();
          const next = (idx + 1) % EXPOSE_VIEWS.length;
          store.setViewExposeSelectedIdx(next);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (idx < EXPOSE_VIEWS.length - 1) store.setViewExposeSelectedIdx(idx + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (idx > 0) store.setViewExposeSelectedIdx(idx - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          const nextRow = idx + cols;
          if (nextRow < EXPOSE_VIEWS.length) store.setViewExposeSelectedIdx(nextRow);
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevRow = idx - cols;
          if (prevRow >= 0) store.setViewExposeSelectedIdx(prevRow);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [viewExposeActive, handleSelectView]);

  if (!viewExposeActive) return null;

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }}
      onClick={() => useUIStore.getState().setViewExposeActive(false)}
    >
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {EXPOSE_VIEWS.map((view, idx) => {
          const isSelected = idx === selectedIdx;
          const isActive = view.id === activeView;
          return (
            <div
              key={view.id}
              className="flex flex-col items-center cursor-pointer transition-transform hover:scale-105"
              style={{
                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
              }}
              onClick={() => handleSelectView(view.id)}
            >
              <div
                className="w-36 h-24 rounded-lg flex items-center justify-center text-4xl transition-all"
                style={{
                  backgroundColor: isActive ? view.color : 'rgba(30, 30, 30, 0.9)',
                  border: isSelected ? `3px solid ${view.color}` : '2px solid rgba(255,255,255,0.1)',
                  boxShadow: isSelected ? `0 0 20px ${view.color}50` : 'none',
                }}
              >
                <span style={{ color: isActive ? '#000' : view.color }}>{view.icon}</span>
              </div>
              <span
                className="mt-2 text-sm font-medium"
                style={{ color: isSelected ? view.color : '#fff' }}
              >
                {view.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
