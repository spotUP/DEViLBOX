/**
 * SynthEditorTabs - Tab navigation for synth editor sections
 * Part of the no-scroll tracker UI implementation
 */

import React from 'react';

export type SynthEditorTab = 'oscillator' | 'envelope' | 'filter' | 'modulation' | 'output' | 'special';

interface TabDefinition {
  id: SynthEditorTab;
  label: string;
  shortLabel: string;
}

const SYNTH_TABS: TabDefinition[] = [
  { id: 'oscillator', label: 'Oscillator', shortLabel: 'OSC' },
  { id: 'envelope', label: 'Envelope', shortLabel: 'ENV' },
  { id: 'filter', label: 'Filter', shortLabel: 'FLT' },
  { id: 'modulation', label: 'Modulation', shortLabel: 'MOD' },
  { id: 'output', label: 'Output', shortLabel: 'OUT' },
  { id: 'special', label: 'Special', shortLabel: 'EXT' },
];

interface SynthEditorTabsProps {
  activeTab: SynthEditorTab;
  onTabChange: (tab: SynthEditorTab) => void;
  /** Hide specific tabs (e.g., for sample-based synths) */
  hiddenTabs?: SynthEditorTab[];
  /** Show labels instead of short labels on wider screens */
  showFullLabels?: boolean;
}

export const SynthEditorTabs: React.FC<SynthEditorTabsProps> = ({
  activeTab,
  onTabChange,
  hiddenTabs = [],
  showFullLabels = false,
}) => {
  const visibleTabs = SYNTH_TABS.filter(tab => !hiddenTabs.includes(tab.id));

  return (
    <div className="synth-editor-tabs">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`synth-editor-tab ${activeTab === tab.id ? 'active' : ''}`}
          title={tab.label}
        >
          {showFullLabels ? tab.label : tab.shortLabel}
        </button>
      ))}
    </div>
  );
};

// TB-303 specific tabs
export type TB303Tab = 'main' | 'devilfish';

const TB303_TABS: { id: TB303Tab; label: string }[] = [
  { id: 'main', label: 'MAIN' },
  { id: 'devilfish', label: 'DEVIL FISH' },
];

interface TB303TabsProps {
  activeTab: TB303Tab;
  onTabChange: (tab: TB303Tab) => void;
  devilFishEnabled?: boolean;
}

export const TB303Tabs: React.FC<TB303TabsProps> = ({
  activeTab,
  onTabChange,
  devilFishEnabled = false,
}) => {
  return (
    <div className="synth-editor-tabs">
      {TB303_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`synth-editor-tab ${activeTab === tab.id ? 'active' : ''} ${
            tab.id === 'devilfish' && devilFishEnabled ? 'devil-fish-active' : ''
          }`}
          title={tab.label}
        >
          {tab.label}
          {tab.id === 'devilfish' && devilFishEnabled && (
            <span className="ml-1 text-red-400">*</span>
          )}
        </button>
      ))}
    </div>
  );
};

export { SYNTH_TABS };
