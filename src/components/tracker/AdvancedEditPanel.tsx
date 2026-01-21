/**
 * AdvancedEditPanel - FastTracker II Advanced Editing Tools
 * Volume operations, instrument remapping, macro slots
 */

import React, { useState } from 'react';
import { useTrackerStore } from '@stores';
import { MacroSlotsPanel } from './MacroSlotsPanel';
import { Sliders, Shuffle, Download } from 'lucide-react';

interface AdvancedEditPanelProps {
  onShowScaleVolume?: (scope: 'block' | 'track' | 'pattern') => void;
  onShowFadeVolume?: (scope: 'block' | 'track' | 'pattern') => void;
  onShowRemapInstrument?: (scope: 'block' | 'track' | 'pattern' | 'song') => void;
  onExportPattern?: () => void;
  onExportTrack?: () => void;
}

export const AdvancedEditPanel: React.FC<AdvancedEditPanelProps> = ({
  onShowScaleVolume,
  onShowFadeVolume,
  onShowRemapInstrument,
  onExportPattern,
  onExportTrack,
}) => {
  const { selection } = useTrackerStore();
  const [expandedSection, setExpandedSection] = useState<string | null>('macros');

  const hasSelection = selection !== null;

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="p-4 bg-dark-bgSecondary border border-dark-border rounded space-y-4 max-h-[600px] overflow-y-auto">
      <h3 className="text-text-primary font-bold mb-2 flex items-center gap-2">
        <Sliders size={16} />
        FT2 Advanced Edit
      </h3>

      {/* Volume Operations */}
      <div className="border border-dark-border rounded">
        <button
          onClick={() => toggleSection('volume')}
          className="w-full px-3 py-2 bg-dark-bg hover:bg-dark-bgSecondary text-left text-sm font-medium text-text-primary flex items-center justify-between transition-colors"
        >
          <span>Volume Operations</span>
          <span>{expandedSection === 'volume' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'volume' && (
          <div className="p-3 space-y-2">
            <div className="text-xs text-text-secondary mb-2">
              Transform volume values across selection, track, or pattern
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onShowScaleVolume?.('block')}
                disabled={!hasSelection}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Scale Block
              </button>
              <button
                onClick={() => onShowFadeVolume?.('block')}
                disabled={!hasSelection}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Fade Block
              </button>
              <button
                onClick={() => onShowScaleVolume?.('track')}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Scale Track
              </button>
              <button
                onClick={() => onShowFadeVolume?.('track')}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Fade Track
              </button>
              <button
                onClick={() => onShowScaleVolume?.('pattern')}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Scale Pattern
              </button>
              <button
                onClick={() => onShowFadeVolume?.('pattern')}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Fade Pattern
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instrument Remapping */}
      <div className="border border-dark-border rounded">
        <button
          onClick={() => toggleSection('remap')}
          className="w-full px-3 py-2 bg-dark-bg hover:bg-dark-bgSecondary text-left text-sm font-medium text-text-primary flex items-center justify-between transition-colors"
        >
          <span className="flex items-center gap-2">
            <Shuffle size={14} />
            Instrument Remap
          </span>
          <span>{expandedSection === 'remap' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'remap' && (
          <div className="p-3 space-y-2">
            <div className="text-xs text-text-secondary mb-2">
              Find and replace instrument IDs
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onShowRemapInstrument?.('block')}
                disabled={!hasSelection}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Remap Block
              </button>
              <button
                onClick={() => onShowRemapInstrument?.('track')}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                Remap Track
              </button>
              <button
                onClick={() => onShowRemapInstrument?.('pattern')}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                Remap Pattern
              </button>
              <button
                onClick={() => onShowRemapInstrument?.('song')}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                Remap Song
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Export/Import */}
      <div className="border border-dark-border rounded">
        <button
          onClick={() => toggleSection('export')}
          className="w-full px-3 py-2 bg-dark-bg hover:bg-dark-bgSecondary text-left text-sm font-medium text-text-primary flex items-center justify-between transition-colors"
        >
          <span className="flex items-center gap-2">
            <Download size={14} />
            Export/Import
          </span>
          <span>{expandedSection === 'export' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'export' && (
          <div className="p-3 space-y-2">
            <div className="text-xs text-text-secondary mb-2">
              Export patterns and tracks as FT2-compatible files
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onExportPattern}
                className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded flex items-center justify-center gap-1 transition-colors"
              >
                <Download size={12} />
                Pattern (.xp)
              </button>
              <button
                onClick={onExportTrack}
                className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded flex items-center justify-center gap-1 transition-colors"
              >
                <Download size={12} />
                Track (.xt)
              </button>
            </div>

            <div className="text-xs text-text-muted mt-2">
              Import: Use File → Open Module
            </div>
          </div>
        )}
      </div>

      {/* Macro Slots */}
      <div className="border border-dark-border rounded">
        <button
          onClick={() => toggleSection('macros')}
          className="w-full px-3 py-2 bg-dark-bg hover:bg-dark-bgSecondary text-left text-sm font-medium text-text-primary flex items-center justify-between transition-colors"
        >
          <span>Macro Slots</span>
          <span>{expandedSection === 'macros' ? '▼' : '▶'}</span>
        </button>
        {expandedSection === 'macros' && (
          <div className="p-3">
            <MacroSlotsPanel />
          </div>
        )}
      </div>
    </div>
  );
};
