/**
 * HardwareUIPopout — Standalone hardware UI for pop-out window.
 *
 * Renders ONLY the hardware UI canvas (WASM framebuffer blit) without the
 * full instrument editor chrome. Reads from shared Zustand stores (same JS context).
 * Ideal for second-screen use: put the hardware synth UI on another monitor.
 */

import React, { useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getSynthInfo } from '@constants/synthCategories';
import { HardwareUIWrapper, hasHardwareUI } from './hardware/HardwareUIWrapper';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SynthType } from '@typedefs/instrument';

export const HardwareUIPopout: React.FC = () => {
  const instruments = useInstrumentStore((s) => s.instruments);
  const currentInstrumentId = useInstrumentStore((s) => s.currentInstrumentId);
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);

  const currentInstrument = instruments.find((i) => i.id === currentInstrumentId) ?? null;

  // Navigate to prev/next instrument that has a hardware UI
  const hwInstruments = instruments.filter((i) => hasHardwareUI(i.synthType));
  const hwIdx = hwInstruments.findIndex((i) => i.id === currentInstrumentId);

  const handlePrev = () => {
    if (hwInstruments.length === 0) return;
    const idx = (hwIdx - 1 + hwInstruments.length) % hwInstruments.length;
    setCurrentInstrument(hwInstruments[idx].id);
  };

  const handleNext = () => {
    if (hwInstruments.length === 0) return;
    const idx = (hwIdx + 1) % hwInstruments.length;
    setCurrentInstrument(hwInstruments[idx].id);
  };

  // Update window title when instrument changes
  useEffect(() => {
    if (currentInstrument) {
      const info = getSynthInfo(currentInstrument.synthType);
      document.title = `${info.shortName} — ${currentInstrument.name}`;
    }
  }, [currentInstrument?.id, currentInstrument?.name, currentInstrument?.synthType]);

  if (!currentInstrument || !hasHardwareUI(currentInstrument.synthType)) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-bg text-text-muted">
        <p className="text-sm">No hardware UI available for this instrument</p>
      </div>
    );
  }

  const synthInfo = getSynthInfo(currentInstrument.synthType);
  const params = (currentInstrument.parameters ?? {}) as Record<string, number>;

  return (
    <div className="bg-dark-bg w-full h-screen flex flex-col overflow-hidden">
      {/* Minimal header — just nav + instrument name */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border bg-dark-bgSecondary shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={handlePrev} className="p-1 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className={`text-xs font-bold ${synthInfo.color}`}>{synthInfo.shortName}</span>
          <span className="text-sm text-text-primary font-medium">{currentInstrument.name}</span>
          <span className="text-xs text-text-muted font-mono">
            ({hwIdx + 1}/{hwInstruments.length})
          </span>
          <button onClick={handleNext} className="p-1 rounded hover:bg-dark-bgTertiary text-text-muted hover:text-text-primary transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Hardware UI canvas — fills remaining space */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black">
        <HardwareUIWrapper
          synthType={currentInstrument.synthType as SynthType}
          parameters={params}
          onParamChange={(key, value) => {
            updateInstrument(currentInstrument.id, {
              parameters: { ...params, [key]: value },
            });
          }}
          instrumentId={currentInstrument.id}
        />
      </div>
    </div>
  );
};
