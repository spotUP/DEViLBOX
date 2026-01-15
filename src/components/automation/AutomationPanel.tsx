/**
 * AutomationPanel - Container for automation curve editors
 */

import React, { useState } from 'react';
import { useTrackerStore, useAutomationStore } from '@stores';
import { AutomationCurveCanvas } from './AutomationCurve';

import type { AutomationParameter } from '@typedefs/automation';

interface ParameterGroup {
  label: string;
  params: { id: AutomationParameter; name: string; description: string }[];
}

const AUTOMATION_PARAMETER_GROUPS: ParameterGroup[] = [
  {
    label: 'TB-303 Filter',
    params: [
      { id: 'cutoff', name: 'Cutoff', description: 'Filter frequency' },
      { id: 'resonance', name: 'Resonance', description: 'Filter resonance' },
      { id: 'envMod', name: 'Env Mod', description: 'Envelope depth' },
      { id: 'decay', name: 'Decay', description: 'Envelope decay time' },
    ],
  },
  {
    label: 'TB-303 Character',
    params: [
      { id: 'accent', name: 'Accent', description: 'Accent intensity' },
      { id: 'tuning', name: 'Tuning', description: 'Pitch detune' },
      { id: 'overdrive', name: 'Overdrive', description: 'Saturation drive' },
    ],
  },
  {
    label: 'Mixer',
    params: [
      { id: 'volume', name: 'Volume', description: 'Channel volume' },
      { id: 'pan', name: 'Pan', description: 'Stereo panning' },
    ],
  },
  {
    label: 'Effects',
    params: [
      { id: 'distortion', name: 'Distortion', description: 'Drive amount' },
      { id: 'delay', name: 'Delay', description: 'Delay wet mix' },
      { id: 'reverb', name: 'Reverb', description: 'Reverb wet mix' },
    ],
  },
];

export const AutomationPanel: React.FC = () => {
  const { patterns, currentPatternIndex } = useTrackerStore();
  const { getAutomation, setAutomation } = useAutomationStore();
  const [selectedParameter, setSelectedParameter] = useState<AutomationParameter>('cutoff');
  const [selectedChannel, setSelectedChannel] = useState<number>(0);

  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;

  // Keep selected channel in bounds when pattern changes
  const channelIndex = Math.min(selectedChannel, numChannels - 1);

  if (!pattern) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No pattern loaded
      </div>
    );
  }

  const automationCurve = getAutomation(
    pattern.id,
    channelIndex,
    selectedParameter
  );

  const handleCurveChange = (curve: typeof automationCurve) => {
    setAutomation(pattern.id, channelIndex, selectedParameter, curve);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-bgSecondary border-b border-dark-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text-secondary text-sm">Automation</span>
            <span className="text-text-primary font-medium">
              Pattern {String(currentPatternIndex).padStart(2, '0')}: {pattern.name}
            </span>
          </div>

          {/* Channel Selector */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Channel:</span>
            <div className="flex gap-1">
              {Array.from({ length: numChannels }, (_, i) => {
                const channel = pattern.channels[i];
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedChannel(i)}
                    className={`
                      w-8 h-7 text-xs font-mono rounded border transition-all
                      ${channelIndex === i
                        ? 'text-text-inverse border-transparent'
                        : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                    style={channelIndex === i ? { backgroundColor: channel?.color || '#22c55e' } : undefined}
                    title={channel?.name || `Channel ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Selector - Grouped */}
      <div className="border-b border-dark-border bg-dark-bgSecondary p-3">
        <div className="flex gap-6 flex-wrap">
          {AUTOMATION_PARAMETER_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <div className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
                {group.label}
              </div>
              <div className="flex gap-1.5">
                {group.params.map((param) => {
                  const paramCurve = getAutomation(pattern.id, channelIndex, param.id);
                  const hasData = paramCurve.points.length > 0;
                  const isSelected = selectedParameter === param.id;

                  return (
                    <button
                      key={param.id}
                      onClick={() => setSelectedParameter(param.id)}
                      className={`
                        relative px-3 py-1.5 text-xs rounded-md border transition-all duration-150
                        ${
                          isSelected
                            ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-glow-sm'
                            : hasData
                              ? 'bg-orange-500/20 text-orange-400 border-orange-500 hover:bg-orange-500/30'
                              : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight hover:text-text-primary'
                        }
                      `}
                      title={param.description + (hasData ? ' (has automation)' : '')}
                    >
                      {param.name}
                      {/* Active indicator dot */}
                      {hasData && !isSelected && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Automation Curve Editor */}
      <div className="flex-1 overflow-y-auto scrollbar-modern">
        <AutomationCurveCanvas
          curve={automationCurve}
          parameter={selectedParameter}
          patternLength={pattern.length}
          onChange={handleCurveChange}
        />
      </div>
    </div>
  );
};
