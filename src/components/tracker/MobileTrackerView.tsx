/**
 * MobileTrackerView - Mobile-optimized tracker interface
 * Uses tabbed navigation for Pattern, Instruments, and Controls
 */

import React, { useState } from 'react';
import { MobileTabBar, type MobileTab } from '@components/layout/MobileTabBar';
import { PatternEditor } from './PatternEditor';
import { InstrumentListPanel } from '@components/instruments/InstrumentListPanel';
import { TB303KnobPanel } from './TB303KnobPanel';
import { FT2Toolbar } from './FT2Toolbar';
import { Play, Square } from 'lucide-react';
import { useTransportStore, useTrackerStore } from '@stores';

interface MobileTrackerViewProps {
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowInstruments?: () => void;
  showMasterFX?: boolean;
}

export const MobileTrackerView: React.FC<MobileTrackerViewProps> = ({
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowInstruments,
  showMasterFX,
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('pattern');
  const { isPlaying, togglePlayPause } = useTransportStore();
  const { patterns, currentPatternIndex } = useTrackerStore();
  const pattern = patterns[currentPatternIndex];

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* Compact header with essential info */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">PAT</span>
          <span className="text-sm font-bold text-accent-primary">
            {(currentPatternIndex + 1).toString().padStart(2, '0')}
          </span>
          <span className="text-xs text-text-secondary truncate max-w-[100px]">
            {pattern?.name || 'Untitled'}
          </span>
        </div>

        {/* Quick transport controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={togglePlayPause}
            className={`
              p-2 rounded-lg transition-colors touch-target
              ${isPlaying
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bgTertiary text-text-primary hover:bg-dark-bgHover'
              }
            `}
          >
            {isPlaying ? <Square size={18} /> : <Play size={18} />}
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden mobile-bottom-padding">
        {activeTab === 'pattern' && (
          <PatternEditor />
        )}

        {activeTab === 'instruments' && (
          <div className="h-full overflow-y-auto">
            <InstrumentListPanel onEditInstrument={onShowInstruments} />
          </div>
        )}

        {activeTab === 'controls' && (
          <div className="h-full overflow-y-auto">
            {/* TB303 Knobs */}
            <div className="p-4 border-b border-dark-border">
              <TB303KnobPanel />
            </div>

            {/* Simplified Toolbar */}
            <div className="p-2">
              <FT2Toolbar
                onShowExport={onShowExport}
                onShowHelp={onShowHelp}
                onShowMasterFX={onShowMasterFX}
                onShowInstruments={onShowInstruments}
                showMasterFX={showMasterFX}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default MobileTrackerView;
